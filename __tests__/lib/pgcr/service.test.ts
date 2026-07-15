/** @jest-environment node */
export {}; // force module scope - avoids top-level `const` name collisions with other test files that also skip static imports

const getRawPgcr = jest.fn();
const putRawPgcrBytes = jest.fn();
const verifyRawPgcr = jest.fn();
const RPC_NAME = "mark_pgcr_archived_if_current";

jest.mock("@/lib/pgcr/archive", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  class PgcrArchiveError extends Error {
    kind: string;
    retryable: boolean;
    constructor(message: string, kind: string, options: { retryable?: boolean } = {}) {
      super(message);
      this.kind = kind;
      this.retryable = options.retryable ?? false;
    }
  }
  return { getRawPgcr, putRawPgcrBytes, verifyRawPgcr, PgcrArchiveError };
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeDb(config: { maybeSingleQueue?: any[]; rpcResult?: any; rpcError?: any } = {}) {
  const maybeSingleQueue = config.maybeSingleQueue ?? [];
  const upsertCalls: unknown[][] = [];
  const updateCalls: unknown[][] = [];
  const rpcCalls: unknown[][] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => maybeSingleQueue.shift() ?? { data: null, error: null },
    upsert: async (...args: unknown[]) => { upsertCalls.push(args); return { error: null }; },
    update: (...args: unknown[]) => { updateCalls.push(args); return builder; },
    then: (resolve: (v: unknown) => void) => resolve({ error: null }),
  };
  return {
    from: () => builder,
    rpc: async (...args: unknown[]) => { rpcCalls.push(args); return { data: config.rpcResult ?? null, error: config.rpcError ?? null }; },
    _upsertCalls: upsertCalls,
    _updateCalls: updateCalls,
    _rpcCalls: rpcCalls,
  };
}

describe("lib/pgcr/service", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.PGCR_ARCHIVE_READS;
    delete process.env.PGCR_ARCHIVE_WRITES;
    delete process.env.PGCR_ARCHIVE_CLEAR_VERIFIED;
  });

  describe("feature flags", () => {
    it("default to disabled", async () => {
      const { archiveReadsEnabled, archiveWritesEnabled, clearVerifiedEnabled } = await import("@/lib/pgcr/service");
      expect(archiveReadsEnabled()).toBe(false);
      expect(archiveWritesEnabled()).toBe(false);
      expect(clearVerifiedEnabled()).toBe(false);
    });

    it("only \"1\" enables a flag", async () => {
      process.env.PGCR_ARCHIVE_READS = "true";
      const { archiveReadsEnabled } = await import("@/lib/pgcr/service");
      expect(archiveReadsEnabled()).toBe(false);
      process.env.PGCR_ARCHIVE_READS = "1";
      expect(archiveReadsEnabled()).toBe(true);
    });
  });

  describe("readRawPgcr with PGCR_ARCHIVE_READS disabled", () => {
    it("reads Supabase directly and never touches the archive module", async () => {
      const { readRawPgcr } = await import("@/lib/pgcr/service");
      const db = makeDb({ maybeSingleQueue: [{ data: { raw_pgcr: { a: 1 } }, error: null }] });

      const result = await readRawPgcr("123", db);

      expect(result).toEqual({ status: "found", raw: { a: 1 }, source: "supabase" });
      expect(getRawPgcr).not.toHaveBeenCalled();
    });
  });

  describe("readRawPgcr with PGCR_ARCHIVE_READS=1", () => {
    beforeEach(() => { process.env.PGCR_ARCHIVE_READS = "1"; });

    it("prefers Appwrite when it has the object", async () => {
      const { readRawPgcr } = await import("@/lib/pgcr/service");
      getRawPgcr.mockResolvedValue({ a: 1 });
      const db = makeDb({
        maybeSingleQueue: [{
          data: {
            raw_pgcr: { retained: true },
            appwrite_migrated_at: "2026-01-01T00:00:00Z",
            appwrite_sha256: "abc123",
          },
          error: null,
        }],
      });

      const result = await readRawPgcr("123", db);

      expect(result).toEqual({ status: "found", raw: { a: 1 }, source: "appwrite" });
      expect(db._upsertCalls).toHaveLength(0);
    });

    it("does not let an unstamped/orphaned Appwrite object shadow a newer Supabase payload", async () => {
      const { readRawPgcr } = await import("@/lib/pgcr/service");
      getRawPgcr.mockResolvedValue({ stale: true });
      const db = makeDb({
        maybeSingleQueue: [{
          data: { raw_pgcr: { current: true }, appwrite_migrated_at: null, appwrite_sha256: null },
          error: null,
        }],
      });

      const result = await readRawPgcr("123", db);

      expect(result).toEqual({ status: "found", raw: { current: true }, source: "supabase" });
      expect(getRawPgcr).not.toHaveBeenCalled();
    });

    it("falls back to a retained Supabase copy when a verified Appwrite object 404s", async () => {
      const { readRawPgcr } = await import("@/lib/pgcr/service");
      const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      getRawPgcr.mockResolvedValue(null);
      const db = makeDb({
        maybeSingleQueue: [{
          data: {
            raw_pgcr: { a: 1 },
            appwrite_migrated_at: "2026-01-01T00:00:00Z",
            appwrite_sha256: "abc123",
          },
          error: null,
        }],
      });

      await expect(readRawPgcr("123", db)).resolves.toEqual({ status: "found", raw: { a: 1 }, source: "supabase" });
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("INTEGRITY"));
      errorSpy.mockRestore();
    });

    it("falls back to Supabase and logs a warning on a transient Appwrite error", async () => {
      const { readRawPgcr } = await import("@/lib/pgcr/service");
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
      getRawPgcr.mockRejectedValue(new Error("Appwrite timed out"));
      const db = makeDb({
        maybeSingleQueue: [{
          data: {
            raw_pgcr: { a: 1 },
            appwrite_migrated_at: "2026-01-01T00:00:00Z",
            appwrite_sha256: "abc123",
          },
          error: null,
        }],
      });

      const result = await readRawPgcr("123", db);

      expect(result).toEqual({ status: "found", raw: { a: 1 }, source: "supabase" });
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it("returns an explicit retryable integrity error when a verified object is missing after raw was cleared", async () => {
      const { readRawPgcr } = await import("@/lib/pgcr/service");
      const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      getRawPgcr.mockResolvedValue(null);
      const db = makeDb({
        maybeSingleQueue: [{
          data: { raw_pgcr: null, appwrite_migrated_at: "2026-01-01T00:00:00Z", appwrite_sha256: "abc123" },
          error: null,
        }],
      });

      const result = await readRawPgcr("123", db);

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("INTEGRITY"));
      expect(result).toMatchObject({ status: "error", retryable: true, kind: "integrity" });
      errorSpy.mockRestore();
    });

    it("returns an integrity error for partial archive metadata after raw was cleared", async () => {
      const { readRawPgcr } = await import("@/lib/pgcr/service");
      const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      const db = makeDb({
        maybeSingleQueue: [{
          data: { raw_pgcr: null, appwrite_migrated_at: "2026-01-01T00:00:00Z", appwrite_sha256: null },
          error: null,
        }],
      });

      await expect(readRawPgcr("123", db)).resolves.toMatchObject({
        status: "error",
        retryable: true,
        kind: "integrity",
      });
      expect(getRawPgcr).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it("returns a retryable error (not a permanent miss) when Appwrite errors and Supabase has no payload", async () => {
      const { readRawPgcr } = await import("@/lib/pgcr/service");
      jest.spyOn(console, "warn").mockImplementation(() => {});
      getRawPgcr.mockRejectedValue(new Error("network blip"));
      const db = makeDb({
        maybeSingleQueue: [{
          data: { raw_pgcr: null, appwrite_migrated_at: "2026-01-01T00:00:00Z", appwrite_sha256: "abc123" },
          error: null,
        }],
      });

      const result = await readRawPgcr("123", db);

      expect(result.status).toBe("error");
      expect(result).toMatchObject({ retryable: true, kind: "unavailable" });
    });

    it("returns not_found when neither side has the payload", async () => {
      const { readRawPgcr } = await import("@/lib/pgcr/service");
      getRawPgcr.mockResolvedValue(null);
      const db = makeDb({ maybeSingleQueue: [{ data: null, error: null }] });

      await expect(readRawPgcr("123", db)).resolves.toEqual({ status: "not_found" });
      expect(getRawPgcr).not.toHaveBeenCalled();
    });
  });

  describe("persistRawPgcr with PGCR_ARCHIVE_WRITES disabled", () => {
    it("writes only to Supabase and reports archived:false", async () => {
      const { persistRawPgcr } = await import("@/lib/pgcr/service");
      const db = makeDb();

      const result = await persistRawPgcr("123", { a: 1 }, { db, extraFields: { status: "fetched" } });

      expect(result).toEqual({ supabaseWritten: true, archived: false, cleared: false });
      expect(db._upsertCalls[0][0]).toMatchObject({
        instance_id: "123",
        raw_pgcr: { a: 1 },
        status: "fetched",
        appwrite_sha256: null,
        appwrite_bytes: null,
        appwrite_migrated_at: null,
        appwrite_last_verified_at: null,
      });
      expect(putRawPgcrBytes).not.toHaveBeenCalled();
    });

    it("does not allow extraFields to override the raw payload, instance ID, or reset metadata", async () => {
      const { persistRawPgcr } = await import("@/lib/pgcr/service");
      const db = makeDb();

      await persistRawPgcr("123", { current: true }, {
        db,
        extraFields: {
          instance_id: "wrong",
          raw_pgcr: { stale: true },
          appwrite_sha256: "stale-hash",
          appwrite_bytes: 999,
          appwrite_migrated_at: "2026-01-01T00:00:00Z",
          appwrite_last_verified_at: "2026-01-01T00:00:00Z",
        },
      });

      expect(db._upsertCalls[0][0]).toMatchObject({
        instance_id: "123",
        raw_pgcr: { current: true },
        appwrite_sha256: null,
        appwrite_bytes: null,
        appwrite_migrated_at: null,
        appwrite_last_verified_at: null,
      });
    });

    it.each([null, undefined, "not-an-object", 42, true, []])(
      "rejects invalid raw PGCR root %p before any upsert",
      async (invalid) => {
        const { persistRawPgcr } = await import("@/lib/pgcr/service");
        const db = makeDb();

        await expect(persistRawPgcr("123", invalid, { db })).rejects.toThrow(TypeError);
        expect(db._upsertCalls).toHaveLength(0);
      },
    );

    it("rejects a non-serializable raw PGCR before any upsert", async () => {
      const { persistRawPgcr } = await import("@/lib/pgcr/service");
      const db = makeDb();
      const circular: Record<string, unknown> = {};
      circular.self = circular;

      await expect(persistRawPgcr("123", circular, { db })).rejects.toThrow(/not JSON-serializable/);
      expect(db._upsertCalls).toHaveLength(0);
    });

    it("rejects an object whose toJSON serializes to a non-object before any upsert", async () => {
      const { persistRawPgcr } = await import("@/lib/pgcr/service");
      const db = makeDb();

      await expect(persistRawPgcr("123", { toJSON: () => null }, { db })).rejects.toThrow(/serialize to a JSON object/);
      expect(db._upsertCalls).toHaveLength(0);
    });
  });

  describe("persistRawPgcr with PGCR_ARCHIVE_WRITES=1", () => {
    beforeEach(() => { process.env.PGCR_ARCHIVE_WRITES = "1"; });

    it("stamps metadata via the atomic RPC only after the upload is verified", async () => {
      const { persistRawPgcr } = await import("@/lib/pgcr/service");
      putRawPgcrBytes.mockResolvedValue({ outcome: "uploaded", sha256: "abc123", bytes: 42 });
      verifyRawPgcr.mockResolvedValue({ ok: true, actualSha256: "abc123", bytes: 42 });
      const db = makeDb({ maybeSingleQueue: [{ data: { raw_pgcr: '{"a":1}' }, error: null }], rpcResult: true });

      const result = await persistRawPgcr("123", { a: 1 }, { db });

      expect(result).toMatchObject({ supabaseWritten: true, archived: true, cleared: false, sha256: "abc123", bytes: 42 });
      expect(db._rpcCalls).toHaveLength(1);
      const [name, params] = db._rpcCalls[0] as [string, Record<string, unknown>];
      expect(name).toBe(RPC_NAME);
      expect(params).toEqual({ p_instance_id: "123", p_expected_sha256: "abc123", p_clear_raw: false });
    });

    it("leaves raw_pgcr intact and reports archived:false when the Appwrite upload fails", async () => {
      const { persistRawPgcr } = await import("@/lib/pgcr/service");
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
      putRawPgcrBytes.mockRejectedValue(new Error("Appwrite unavailable"));
      const db = makeDb({ maybeSingleQueue: [{ data: { raw_pgcr: '{"a":1}' }, error: null }] });

      const result = await persistRawPgcr("123", { a: 1 }, { db });

      // The Supabase upsert already happened (durable outbox copy) - nothing
      // nulls raw_pgcr, and archived is never falsely reported true.
      expect(result.supabaseWritten).toBe(true);
      expect(result.archived).toBe(false);
      expect(result.cleared).toBe(false);
      expect(db._rpcCalls).toHaveLength(0);
      warn.mockRestore();
    });

    it("never reports archived:true when post-upload verification fails", async () => {
      const { persistRawPgcr } = await import("@/lib/pgcr/service");
      jest.spyOn(console, "warn").mockImplementation(() => {});
      putRawPgcrBytes.mockResolvedValue({ outcome: "uploaded", sha256: "abc123", bytes: 42 });
      verifyRawPgcr.mockResolvedValue({ ok: false, actualSha256: "different", bytes: 42 });
      const db = makeDb({ maybeSingleQueue: [{ data: { raw_pgcr: '{"a":1}' }, error: null }] });

      const result = await persistRawPgcr("123", { a: 1 }, { db });

      expect(result.archived).toBe(false);
      expect(db._rpcCalls).toHaveLength(0);
    });

    it("does not clear raw_pgcr when PGCR_ARCHIVE_CLEAR_VERIFIED is disabled (RPC still stamps metadata with p_clear_raw=false)", async () => {
      const { persistRawPgcr } = await import("@/lib/pgcr/service");
      putRawPgcrBytes.mockResolvedValue({ outcome: "uploaded", sha256: "abc123", bytes: 42 });
      verifyRawPgcr.mockResolvedValue({ ok: true, actualSha256: "abc123", bytes: 42 });
      const db = makeDb({ maybeSingleQueue: [{ data: { raw_pgcr: '{"a":1}' }, error: null }], rpcResult: true });

      const result = await persistRawPgcr("123", { a: 1 }, { db });

      expect(result.archived).toBe(true);
      expect(result.cleared).toBe(false);
      expect(db._rpcCalls[0][1]).toMatchObject({ p_clear_raw: false });
    });

    it("stamps metadata AND clears through one guarded RPC call when PGCR_ARCHIVE_CLEAR_VERIFIED=1 and verification passed", async () => {
      process.env.PGCR_ARCHIVE_CLEAR_VERIFIED = "1";
      const { persistRawPgcr } = await import("@/lib/pgcr/service");
      putRawPgcrBytes.mockResolvedValue({ outcome: "uploaded", sha256: "abc123", bytes: 42 });
      verifyRawPgcr.mockResolvedValue({ ok: true, actualSha256: "abc123", bytes: 42 });
      const db = makeDb({ maybeSingleQueue: [{ data: { raw_pgcr: '{"a":1}' }, error: null }], rpcResult: true });

      const result = await persistRawPgcr("123", { a: 1 }, { db });

      expect(result.archived).toBe(true);
      expect(result.cleared).toBe(true);
      // Exactly one RPC call does both - not a separate metadata update plus
      // a separate clear call.
      expect(db._rpcCalls).toHaveLength(1);
      expect(db._rpcCalls[0]).toEqual([
        RPC_NAME,
        { p_instance_id: "123", p_expected_sha256: "abc123", p_clear_raw: true },
      ]);
    });

    it("reports archived:false and cleared:false when the RPC's checksum guard rejects a concurrent write (0 rows affected)", async () => {
      process.env.PGCR_ARCHIVE_CLEAR_VERIFIED = "1";
      const { persistRawPgcr } = await import("@/lib/pgcr/service");
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
      putRawPgcrBytes.mockResolvedValue({ outcome: "uploaded", sha256: "abc123", bytes: 42 });
      verifyRawPgcr.mockResolvedValue({ ok: true, actualSha256: "abc123", bytes: 42 });
      const db = makeDb({ maybeSingleQueue: [{ data: { raw_pgcr: '{"a":1}' }, error: null }], rpcResult: false });

      const result = await persistRawPgcr("123", { a: 1 }, { db });

      // A guard rejection means neither metadata nor clearing happened - the
      // whole stamp-and-maybe-clear is one atomic operation now, so a
      // rejected guard cannot leave metadata stamped without a clear (or
      // vice versa).
      expect(result.archived).toBe(false);
      expect(result.cleared).toBe(false);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("mark_pgcr_archived_if_current rejected"));
      warn.mockRestore();
    });
  });

  describe("archiveStoredRawPgcr", () => {
    it("retries an existing outbox row without performing another upsert", async () => {
      process.env.PGCR_ARCHIVE_CLEAR_VERIFIED = "1";
      const { archiveStoredRawPgcr } = await import("@/lib/pgcr/service");
      putRawPgcrBytes.mockResolvedValue({ outcome: "already_present", sha256: "abc123", bytes: 42 });
      verifyRawPgcr.mockResolvedValue({ ok: true, actualSha256: "abc123", bytes: 42 });
      const db = makeDb({ maybeSingleQueue: [{ data: { raw_pgcr: '{"a":1}' }, error: null }], rpcResult: true });

      const result = await archiveStoredRawPgcr("123", { db });

      expect(result).toMatchObject({ archived: true, cleared: true, sha256: "abc123", bytes: 42 });
      expect(db._upsertCalls).toHaveLength(0);
      expect(db._rpcCalls[0]).toEqual([
        RPC_NAME,
        { p_instance_id: "123", p_expected_sha256: "abc123", p_clear_raw: true },
      ]);
    });
  });
});
