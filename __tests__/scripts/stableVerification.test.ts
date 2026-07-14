/** @jest-environment node */
import {
  captureFullVerificationTarget,
  chooseEvenlySpacedIds,
  findUnaccountedBucketIds,
} from "../../scripts/lib/stableVerification.mjs";

describe("stable full-verification target", () => {
  it("captures state and target metadata in one short read-only snapshot", async () => {
    const state = { verified_count: "2", unarchived_raw_count: "0", incomplete_metadata_count: "0" };
    const targets = [
      { instance_id: "1", appwrite_sha256: "a", appwrite_bytes: "1" },
      { instance_id: "2", appwrite_sha256: "b", appwrite_bytes: "2" },
    ];
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [state] })
        .mockResolvedValueOnce({ rows: targets })
        .mockResolvedValueOnce({ rows: [] }),
    };

    await expect(captureFullVerificationTarget(client)).resolves.toEqual({ state, targets });
    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual([
      "begin transaction isolation level repeatable read read only",
      expect.stringContaining("from pgcr_cache"),
      expect.stringContaining("select instance_id, appwrite_sha256, appwrite_bytes"),
      "commit",
    ]);
  });

  it("rolls back when target capture fails", async () => {
    const captureError = new Error("capture failed");
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ verified_count: "1" }] })
        .mockRejectedValueOnce(captureError)
        .mockResolvedValueOnce({ rows: [] }),
    };

    await expect(captureFullVerificationTarget(client)).rejects.toBe(captureError);
    expect(client.query).toHaveBeenLastCalledWith("rollback");
  });

  it("selects deterministic, evenly-spaced sample IDs without ORDER BY random", () => {
    const ids = Array.from({ length: 10 }, (_, index) => String(index));
    expect(chooseEvenlySpacedIds(ids, 3)).toEqual(["1", "5", "8"]);
    expect(chooseEvenlySpacedIds(ids, 20)).toEqual(ids);
  });

  it("rechecks post-snapshot bucket IDs in bounded chunks and only returns true orphans", async () => {
    const rowsById = new Map([
      ["new-migrated", { instance_id: "new-migrated", has_raw: false, is_migrated: true }],
      ["inflight-raw", { instance_id: "inflight-raw", has_raw: true, is_migrated: false }],
      ["invalid-empty", { instance_id: "invalid-empty", has_raw: false, is_migrated: false }],
    ]);
    const client = {
      query: jest.fn(async (_sql: string, [ids]: [string[]]) => ({
        rows: ids.flatMap((id) => rowsById.has(id) ? [rowsById.get(id)] : []),
      })),
    };

    await expect(
      findUnaccountedBucketIds(
        client,
        ["new-migrated", "inflight-raw", "invalid-empty", "missing-row", "another-missing"],
        2,
      ),
    ).resolves.toEqual(["invalid-empty", "missing-row", "another-missing"]);
    expect(client.query).toHaveBeenCalledTimes(3);
    for (const [, [ids]] of client.query.mock.calls) expect(ids.length).toBeLessThanOrEqual(2);
  });
});
