/** @jest-environment node */
import { createHash } from "node:crypto";

// Shared mock Storage instance so every `new Storage(client)` call inside
// archive.ts's lazily-constructed client resolves to the same jest.fn()s we
// configure per test.
const createFile = jest.fn();
const getFile = jest.fn();
const getFileDownload = jest.fn();
const fetchMock = jest.fn();
const ORIGINAL_FETCH = global.fetch;

class MockAppwriteException extends Error {
  code: number;
  type: string;
  response: string;
  constructor(message?: string, code = 0, type = "", response = "") {
    super(message);
    this.name = "AppwriteException";
    this.code = code;
    this.type = type;
    this.response = response;
  }
}

jest.mock("node-appwrite", () => ({
  Client: class {
    setEndpoint() { return this; }
    setProject() { return this; }
    setKey() { return this; }
  },
  Storage: class {
    createFile = createFile;
    getFile = getFile;
    getFileDownload = getFileDownload;
  },
  AppwriteException: MockAppwriteException,
}));

jest.mock("node-appwrite/file", () => ({
  InputFile: {
    fromBuffer: (bytes: Buffer, name: string) => ({ bytes, name }),
  },
}));

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function downloadResponse(bytes: Buffer, status = 200, contentType = "application/json") {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => name.toLowerCase() === "content-type" ? contentType : null },
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
}

describe("lib/pgcr/archive", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    process.env.APPWRITE_ENDPOINT = "https://example.appwrite.io/v1";
    process.env.APPWRITE_PROJECT_ID = "test-project";
    process.env.APPWRITE_API_KEY = "test-key";
    process.env.APPWRITE_PGCR_BUCKET_ID = "pgcr-archive";
    global.fetch = fetchMock as unknown as typeof fetch;
    jest.spyOn(Math, "random").mockReturnValue(0);
    // Retry backoff uses real timers with real waits by default; speed tests
    // up by making Math.random deterministic and small enough to not matter -
    // the real wait time is bounded by the module's own MAX_BACKOFF_MS so
    // this stays fast even without faking timers.
  });

  afterEach(() => {
    delete process.env.APPWRITE_ENDPOINT;
    delete process.env.APPWRITE_PROJECT_ID;
    delete process.env.APPWRITE_API_KEY;
    delete process.env.APPWRITE_PGCR_BUCKET_ID;
    jest.restoreAllMocks();
  });

  afterAll(() => { global.fetch = ORIGINAL_FETCH; });

  describe("validateInstanceId", () => {
    it("accepts a typical Destiny instance ID", async () => {
      const { validateInstanceId } = await import("@/lib/pgcr/archive");
      expect(validateInstanceId("4611686018429000001")).toBe("4611686018429000001");
    });

    it("rejects an ID starting with a special character", async () => {
      const { validateInstanceId, PgcrArchiveError } = await import("@/lib/pgcr/archive");
      expect(() => validateInstanceId("-abc")).toThrow(PgcrArchiveError);
    });

    it("rejects an ID longer than 36 characters", async () => {
      const { validateInstanceId } = await import("@/lib/pgcr/archive");
      expect(() => validateInstanceId("a".repeat(37))).toThrow();
    });
  });

  describe("putRawPgcr / putRawPgcrBytes", () => {
    it("uploads successfully when the object does not already exist", async () => {
      const { putRawPgcrBytes } = await import("@/lib/pgcr/archive");
      createFile.mockResolvedValue({ $id: "123" });
      const bytes = Buffer.from('{"a":1}', "utf8");

      const result = await putRawPgcrBytes("123", bytes);

      expect(result.outcome).toBe("uploaded");
      expect(result.sha256).toBe(sha256(bytes));
      expect(createFile).toHaveBeenCalledTimes(1);
      expect(createFile.mock.calls[0][0].file.name).toBe("123.json");
    });

    it("on 409 with a matching checksum, reports idempotent success without re-uploading", async () => {
      const { putRawPgcrBytes } = await import("@/lib/pgcr/archive");
      const bytes = Buffer.from('{"a":1}', "utf8");
      createFile.mockRejectedValue(new MockAppwriteException("exists", 409, "storage_file_already_exists"));
      fetchMock.mockResolvedValue(downloadResponse(bytes));

      const result = await putRawPgcrBytes("123", bytes);

      expect(result.outcome).toBe("already_present");
      expect(result.sha256).toBe(sha256(bytes));
    });

    it("on 409 with a conflicting checksum, throws and never overwrites either copy", async () => {
      const { putRawPgcrBytes, PgcrArchiveError } = await import("@/lib/pgcr/archive");
      const bytes = Buffer.from('{"a":1}', "utf8");
      const different = Buffer.from('{"a":2}', "utf8");
      createFile.mockRejectedValue(new MockAppwriteException("exists", 409, "storage_file_already_exists"));
      fetchMock.mockResolvedValue(downloadResponse(different));

      await expect(putRawPgcrBytes("123", bytes)).rejects.toThrow(PgcrArchiveError);
      await expect(putRawPgcrBytes("123", bytes)).rejects.toMatchObject({ kind: "conflict" });
      // Never attempts a second create call to "resolve" the conflict.
      expect(createFile).toHaveBeenCalledTimes(2);
    });

    it("retries on 429 and eventually succeeds", async () => {
      const { putRawPgcrBytes } = await import("@/lib/pgcr/archive");
      const bytes = Buffer.from('{"a":1}', "utf8");
      createFile
        .mockRejectedValueOnce(new MockAppwriteException("throttled", 429, "rate_limit"))
        .mockResolvedValueOnce({ $id: "123" });

      const result = await putRawPgcrBytes("123", bytes);

      expect(result.outcome).toBe("uploaded");
      expect(createFile).toHaveBeenCalledTimes(2);
    });

    it("exhausts retries on persistent 5xx and throws a transient error", async () => {
      const { putRawPgcrBytes, PgcrArchiveError } = await import("@/lib/pgcr/archive");
      const bytes = Buffer.from('{"a":1}', "utf8");
      createFile.mockRejectedValue(new MockAppwriteException("down", 503, "server_error"));

      await expect(putRawPgcrBytes("123", bytes)).rejects.toThrow(PgcrArchiveError);
      // MAX_ATTEMPTS = 4 - bounded, not unbounded.
      expect(createFile).toHaveBeenCalledTimes(4);
    }, 15_000);

    it("does not silently overwrite - a non-retryable error propagates without a create-only bypass", async () => {
      const { putRawPgcrBytes } = await import("@/lib/pgcr/archive");
      const bytes = Buffer.from('{"a":1}', "utf8");
      createFile.mockRejectedValue(new MockAppwriteException("bad request", 400, "bad_request"));

      await expect(putRawPgcrBytes("123", bytes)).rejects.toMatchObject({ kind: "unknown" });
      expect(createFile).toHaveBeenCalledTimes(1);
    });
  });

  describe("getRawPgcr / getRawPgcrBytes", () => {
    it("returns null on a normal 404 instead of throwing", async () => {
      const { getRawPgcrBytes } = await import("@/lib/pgcr/archive");
      fetchMock.mockResolvedValue(downloadResponse(Buffer.alloc(0), 404));

      await expect(getRawPgcrBytes("999")).resolves.toBeNull();
    });

    it("preserves exact bytes when Appwrite serves application/json", async () => {
      const { getRawPgcrBytes } = await import("@/lib/pgcr/archive");
      const bytes = Buffer.from('{  "z": 1,\n"a": [2, 3] }', "utf8");
      fetchMock.mockResolvedValue(downloadResponse(bytes, 200, "application/json; charset=utf-8"));

      const result = await getRawPgcrBytes("123");

      expect(result).not.toBeNull();
      expect(result?.equals(bytes)).toBe(true);
      expect(sha256(result!)).toBe(sha256(bytes));
      expect(getFileDownload).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledWith(
        "https://example.appwrite.io/v1/storage/buckets/pgcr-archive/files/123/download",
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            "X-Appwrite-Project": "test-project",
            "X-Appwrite-Key": "test-key",
          }),
        }),
      );
    });

    it("retries direct downloads on 429 and succeeds with exact bytes", async () => {
      const { getRawPgcrBytes } = await import("@/lib/pgcr/archive");
      const bytes = Buffer.from('{"a":1}', "utf8");
      fetchMock
        .mockResolvedValueOnce(downloadResponse(Buffer.alloc(0), 429))
        .mockResolvedValueOnce(downloadResponse(bytes));

      await expect(getRawPgcrBytes("123")).resolves.toEqual(bytes);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("retries direct downloads on 5xx and stops after the bounded attempt count", async () => {
      const { getRawPgcrBytes } = await import("@/lib/pgcr/archive");
      fetchMock.mockResolvedValue(downloadResponse(Buffer.alloc(0), 503));

      await expect(getRawPgcrBytes("123")).rejects.toMatchObject({ kind: "transient", retryable: true });
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it("does not retry non-retryable download status codes", async () => {
      const { getRawPgcrBytes } = await import("@/lib/pgcr/archive");
      fetchMock.mockResolvedValue(downloadResponse(Buffer.from("secret body"), 403));

      await expect(getRawPgcrBytes("123")).rejects.toMatchObject({ kind: "unknown", retryable: false });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("preserves an unwrapped historical shape byte-for-byte", async () => {
      const { getRawPgcr } = await import("@/lib/pgcr/archive");
      const payload = { activityDetails: { instanceId: "123" }, entries: [{ x: 1 }] };
      const bytes = Buffer.from(JSON.stringify(payload), "utf8");
      fetchMock.mockResolvedValue(downloadResponse(bytes));

      await expect(getRawPgcr("123")).resolves.toEqual(payload);
    });

    it("preserves a wrapped historical {Response: ...} shape without unwrapping it", async () => {
      const { getRawPgcr } = await import("@/lib/pgcr/archive");
      const payload = { Response: { activityDetails: { instanceId: "123" }, entries: [] } };
      const bytes = Buffer.from(JSON.stringify(payload), "utf8");
      fetchMock.mockResolvedValue(downloadResponse(bytes));

      await expect(getRawPgcr("123")).resolves.toEqual(payload);
    });
  });

  describe("verifyRawPgcr", () => {
    it("reports ok:true when the downloaded checksum matches", async () => {
      const { verifyRawPgcr } = await import("@/lib/pgcr/archive");
      const bytes = Buffer.from('{"a":1}', "utf8");
      fetchMock.mockResolvedValue(downloadResponse(bytes));

      const result = await verifyRawPgcr("123", sha256(bytes));
      expect(result.ok).toBe(true);
    });

    it("reports ok:false when the object is missing", async () => {
      const { verifyRawPgcr } = await import("@/lib/pgcr/archive");
      fetchMock.mockResolvedValue(downloadResponse(Buffer.alloc(0), 404));

      const result = await verifyRawPgcr("123", "deadbeef");
      expect(result.ok).toBe(false);
      expect(result.actualSha256).toBeNull();
    });

    it("reports ok:false on a checksum mismatch without throwing", async () => {
      const { verifyRawPgcr } = await import("@/lib/pgcr/archive");
      const bytes = Buffer.from('{"a":1}', "utf8");
      fetchMock.mockResolvedValue(downloadResponse(bytes));

      const result = await verifyRawPgcr("123", "0000000000000000000000000000000000000000000000000000000000000000");
      expect(result.ok).toBe(false);
    });
  });

  describe("hasRawPgcr", () => {
    it("returns true when getFile resolves", async () => {
      const { hasRawPgcr } = await import("@/lib/pgcr/archive");
      getFile.mockResolvedValue({ $id: "123" });
      await expect(hasRawPgcr("123")).resolves.toBe(true);
    });

    it("returns false on 404", async () => {
      const { hasRawPgcr } = await import("@/lib/pgcr/archive");
      getFile.mockRejectedValue(new MockAppwriteException("not found", 404, "storage_file_not_found"));
      await expect(hasRawPgcr("123")).resolves.toBe(false);
    });
  });

  it("never reads or requires environment variables at import time (lazy client)", async () => {
    delete process.env.APPWRITE_ENDPOINT;
    delete process.env.APPWRITE_PROJECT_ID;
    delete process.env.APPWRITE_API_KEY;
    // Importing the module must not throw even with no APPWRITE_* vars set -
    // env is only validated when the archive is actually used (next build safety).
    await expect(import("@/lib/pgcr/archive")).resolves.toBeDefined();
  });
});
