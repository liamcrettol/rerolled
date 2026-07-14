/** @jest-environment node */
export {}; // force module scope - avoids top-level `const` name collisions with other test files that also skip static imports

const putRawPgcrBytes = jest.fn();
const getRawPgcrBytes = jest.fn();
const verifyRawPgcr = jest.fn();
const markArchivedIfCurrent = jest.fn();

jest.mock("../../scripts/lib/pgcrArchiveCore.mjs", () => {
  class PgcrArchiveError extends Error {
    kind: string;
    constructor(message: string, kind: string) {
      super(message);
      this.kind = kind;
    }
  }
  return {
    putRawPgcrBytes,
    getRawPgcrBytes,
    verifyRawPgcr,
    sha256Of: (bytes: Buffer) => require("node:crypto").createHash("sha256").update(bytes).digest("hex"),
    markArchivedIfCurrent,
    PgcrArchiveError,
  };
});

function fakeClient() {
  return { query: jest.fn() };
}

describe("scripts/lib/reconcileRows.mjs", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("fetchArchivePage / fetchClearPage select disjoint row sets", () => {
    it("archive-mode query filters appwrite_migrated_at IS NULL", async () => {
      const { fetchArchivePage } = await import("../../scripts/lib/reconcileRows.mjs");
      const client = fakeClient();
      client.query.mockResolvedValue({ rows: [] });

      await fetchArchivePage(client, "", 10);

      const sql = client.query.mock.calls[0][0] as string;
      expect(sql).toMatch(/appwrite_migrated_at is null/);
      expect(sql).not.toMatch(/appwrite_migrated_at is not null/);
    });

    it("clear-mode query filters appwrite_migrated_at IS NOT NULL - historical migrated rows are visible to it", async () => {
      const { fetchClearPage } = await import("../../scripts/lib/reconcileRows.mjs");
      const client = fakeClient();
      // A row migrated by an earlier, separate run (e.g. the historical
      // migration script): appwrite_migrated_at and appwrite_sha256 already
      // set, raw_pgcr still present. This is exactly the row shape the old
      // buggy single-query design could never reach.
      const historicalRow = { instance_id: "111", appwrite_sha256: "abc", supabase_text: '{"a":1}' };
      client.query.mockResolvedValue({ rows: [historicalRow] });

      const rows = await fetchClearPage(client, "", 10);

      const sql = client.query.mock.calls[0][0] as string;
      expect(sql).toMatch(/appwrite_migrated_at is not null/);
      expect(sql).toMatch(/appwrite_sha256 is not null/);
      expect(rows).toEqual([historicalRow]);
    });
  });

  describe("processArchiveRow", () => {
    it("does not report a row as archived when the checksum guard rejects it (concurrent write)", async () => {
      const { processArchiveRow } = await import("../../scripts/lib/reconcileRows.mjs");
      putRawPgcrBytes.mockResolvedValue({ outcome: "uploaded", sha256: "abc123", bytes: 42 });
      verifyRawPgcr.mockResolvedValue({ ok: true, actualSha256: "abc123", bytes: 42 });
      markArchivedIfCurrent.mockResolvedValue(false); // guard rejects: raw_pgcr changed concurrently

      const onFailure = jest.fn();
      const client = fakeClient();
      const delta = await processArchiveRow(client, { instance_id: "111", payload: '{"a":1}' }, { onFailure });

      expect(delta.verified).toBeUndefined();
      expect(delta.failed).toBe(1);
      expect(onFailure).toHaveBeenCalledWith("111", "guard_rejected_concurrent_write");
    });

    it("stamps metadata via exactly one guarded RPC call with p_clear_raw=false", async () => {
      const { processArchiveRow } = await import("../../scripts/lib/reconcileRows.mjs");
      putRawPgcrBytes.mockResolvedValue({ outcome: "uploaded", sha256: "abc123", bytes: 42 });
      verifyRawPgcr.mockResolvedValue({ ok: true, actualSha256: "abc123", bytes: 42 });
      markArchivedIfCurrent.mockResolvedValue(true);

      const client = fakeClient();
      const delta = await processArchiveRow(client, { instance_id: "111", payload: '{"a":1}' }, {});

      expect(delta.verified).toBe(1);
      expect(markArchivedIfCurrent).toHaveBeenCalledTimes(1);
      expect(markArchivedIfCurrent).toHaveBeenCalledWith(client, "111", "abc123", false);
    });

    it("dry-run never calls putRawPgcrBytes or markArchivedIfCurrent", async () => {
      const { processArchiveRow } = await import("../../scripts/lib/reconcileRows.mjs");
      const client = fakeClient();

      const delta = await processArchiveRow(client, { instance_id: "111", payload: '{"a":1}' }, { dryRun: true });

      expect(delta.bytesInspected).toBeGreaterThan(0);
      expect(putRawPgcrBytes).not.toHaveBeenCalled();
      expect(markArchivedIfCurrent).not.toHaveBeenCalled();
    });
  });

  describe("processClearRow", () => {
    const row = { instance_id: "111", appwrite_sha256: "deadbeef", supabase_text: '{"a":1}' };

    it("clears via one atomic guarded call with p_clear_raw=true, after both checksums verify", async () => {
      const { processClearRow } = await import("../../scripts/lib/reconcileRows.mjs");
      const bytes = Buffer.from('{"a":1}', "utf8");
      const sha256 = require("node:crypto").createHash("sha256").update(bytes).digest("hex");
      const clearRow = { ...row, appwrite_sha256: sha256 };
      getRawPgcrBytes.mockResolvedValue(bytes);
      markArchivedIfCurrent.mockResolvedValue(true);

      const client = fakeClient();
      const delta = await processClearRow(client, clearRow, {});

      expect(delta.cleared).toBe(1);
      expect(markArchivedIfCurrent).toHaveBeenCalledTimes(1);
      expect(markArchivedIfCurrent).toHaveBeenCalledWith(client, "111", sha256, true);
    });

    it("leaves raw_pgcr intact (never calls the clear RPC) when the re-downloaded Appwrite object's checksum doesn't match", async () => {
      const { processClearRow } = await import("../../scripts/lib/reconcileRows.mjs");
      getRawPgcrBytes.mockResolvedValue(Buffer.from('{"different":true}', "utf8"));

      const onFailure = jest.fn();
      const client = fakeClient();
      const delta = await processClearRow(client, row, { onFailure });

      expect(delta.cleared).toBeUndefined();
      expect(delta.failed).toBe(1);
      expect(markArchivedIfCurrent).not.toHaveBeenCalled();
      expect(onFailure).toHaveBeenCalledWith("111", "integrity_appwrite_checksum_mismatch");
    });

    it("leaves raw_pgcr intact when the Appwrite object is unexpectedly missing", async () => {
      const { processClearRow } = await import("../../scripts/lib/reconcileRows.mjs");
      getRawPgcrBytes.mockResolvedValue(null);

      const onFailure = jest.fn();
      const client = fakeClient();
      const delta = await processClearRow(client, row, { onFailure });

      expect(delta.failed).toBe(1);
      expect(markArchivedIfCurrent).not.toHaveBeenCalled();
      expect(onFailure).toHaveBeenCalledWith("111", "integrity_appwrite_object_missing");
    });

    it("leaves raw_pgcr intact when the CURRENT Supabase payload has drifted from what was archived", async () => {
      const { processClearRow } = await import("../../scripts/lib/reconcileRows.mjs");
      const archivedBytes = Buffer.from('{"a":1}', "utf8");
      const archivedSha256 = require("node:crypto").createHash("sha256").update(archivedBytes).digest("hex");
      getRawPgcrBytes.mockResolvedValue(archivedBytes);

      const driftedRow = { instance_id: "111", appwrite_sha256: archivedSha256, supabase_text: '{"a":2}' };
      const onFailure = jest.fn();
      const client = fakeClient();
      const delta = await processClearRow(client, driftedRow, { onFailure });

      expect(delta.failed).toBe(1);
      expect(markArchivedIfCurrent).not.toHaveBeenCalled();
      expect(onFailure).toHaveBeenCalledWith("111", "supabase_payload_drifted_since_archive");
    });

    it("dry-run never downloads from Appwrite or calls the clear RPC", async () => {
      const { processClearRow } = await import("../../scripts/lib/reconcileRows.mjs");
      const client = fakeClient();

      const delta = await processClearRow(client, row, { dryRun: true });

      expect(delta.eligibleForClear).toBe(1);
      expect(getRawPgcrBytes).not.toHaveBeenCalled();
      expect(markArchivedIfCurrent).not.toHaveBeenCalled();
    });
  });

  describe("reconciliation dry-run termination (via the real fetch/process pair)", () => {
    it("an unbounded dry-run sweep over the real archive fetch/process functions terminates", async () => {
      const { fetchArchivePage, processArchiveRow } = await import("../../scripts/lib/reconcileRows.mjs");
      const { runSweep } = await import("../../scripts/lib/reconcileSweep.mjs");

      const table = Array.from({ length: 15 }, (_, i) => ({
        instance_id: `id-${String(i).padStart(3, "0")}`,
        payload: '{"a":1}',
      }));
      const client = {
        query: jest.fn(async (_sql: string, [cursor, limit]: [string, number]) => ({
          rows: table.filter((r) => r.instance_id > cursor).slice(0, limit),
        })),
      };

      const counts = await runSweep({
        fetchPage: (cursor: string, pageSize: number) => fetchArchivePage(client, cursor, pageSize),
        processRow: (row: unknown) => processArchiveRow(client, row, { dryRun: true }),
        keyOf: (row: { instance_id: string }) => row.instance_id,
        batchSize: 4,
        // limit intentionally omitted.
      });

      expect(counts.inspected).toBe(15);
      expect(putRawPgcrBytes).not.toHaveBeenCalled();
    });
  });
});
