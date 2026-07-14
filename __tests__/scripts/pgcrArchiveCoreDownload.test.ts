/** @jest-environment node */
import { createHash } from "node:crypto";
import { getRawPgcrBytes } from "../../scripts/lib/pgcrArchiveCore.mjs";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = global.fetch;
const fetchMock = jest.fn();

function response(bytes: Buffer, status = 200, contentType = "application/json") {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => name.toLowerCase() === "content-type" ? contentType : null },
    arrayBuffer: jest.fn(async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)),
  };
}

describe("scripts/lib/pgcrArchiveCore exact-byte downloads", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...ORIGINAL_ENV,
      APPWRITE_ENDPOINT: "https://example.appwrite.io/v1/",
      APPWRITE_PROJECT_ID: "project-id",
      APPWRITE_API_KEY: "server-key",
      APPWRITE_PGCR_BUCKET_ID: "pgcr-archive",
    };
    global.fetch = fetchMock as unknown as typeof fetch;
    jest.spyOn(Math, "random").mockReturnValue(0);
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.restoreAllMocks();
  });

  afterAll(() => { global.fetch = ORIGINAL_FETCH; });

  it("returns exact bytes even when Appwrite labels the response application/json", async () => {
    const bytes = Buffer.from('{ "z":1,\n  "a" : [3,2] }', "utf8");
    fetchMock.mockResolvedValue(response(bytes, 200, "application/json; charset=utf-8"));

    const downloaded = await getRawPgcrBytes("123");

    expect(downloaded?.equals(bytes)).toBe(true);
    expect(createHash("sha256").update(downloaded!).digest("hex"))
      .toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.appwrite.io/v1/storage/buckets/pgcr-archive/files/123/download",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Appwrite-Project": "project-id",
          "X-Appwrite-Key": "server-key",
        }),
      }),
    );
  });

  it("returns null for 404 without reading or logging the response body", async () => {
    const res = response(Buffer.from("sensitive response body"), 404);
    fetchMock.mockResolvedValue(res);

    await expect(getRawPgcrBytes("123")).resolves.toBeNull();
    expect(res.arrayBuffer).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries 429/5xx statuses but not other HTTP failures", async () => {
    const bytes = Buffer.from("{}", "utf8");
    fetchMock
      .mockResolvedValueOnce(response(Buffer.alloc(0), 429))
      .mockResolvedValueOnce(response(Buffer.alloc(0), 503))
      .mockResolvedValueOnce(response(bytes, 200));

    await expect(getRawPgcrBytes("123")).resolves.toEqual(bytes);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    fetchMock.mockClear().mockResolvedValue(response(Buffer.alloc(0), 403));
    await expect(getRawPgcrBytes("123")).rejects.toMatchObject({ kind: "unknown", retryable: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("validates the file ID before issuing a request", async () => {
    await expect(getRawPgcrBytes("../escape")).rejects.toMatchObject({ kind: "invalid_id" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
