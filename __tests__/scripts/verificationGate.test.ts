/** @jest-environment node */
import { assessArchiveCounts, compareArchiveIdSets } from "../../scripts/lib/verificationGate.mjs";

describe("PGCR archive cleanup verification gate", () => {
  it("fails a partial migration even when bucket and migrated-row counts match", () => {
    const problems = assessArchiveCounts({
      verifiedCount: 500,
      bucketCount: 500,
      unarchivedRawCount: 41_947,
      incompleteMetadataCount: 0,
      requireComplete: true,
    });
    expect(problems).toEqual([expect.stringContaining("PARTIAL MIGRATION")]);
  });

  it("reports count and metadata discrepancies", () => {
    const problems = assessArchiveCounts({
      verifiedCount: 10,
      bucketCount: 9,
      unarchivedRawCount: 0,
      incompleteMetadataCount: 2,
      requireComplete: true,
    });
    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatch(/count mismatch/);
    expect(problems[1]).toMatch(/incomplete/);
  });

  it("detects balanced missing/orphan swaps that count parity cannot catch", () => {
    const diff = compareArchiveIdSets(["1", "2", "orphan"], ["1", "2", "missing"]);
    expect(diff).toEqual({ orphans: ["orphan"], missing: ["missing"] });
  });

  it("allows aggregate counts to move during a stable full-target run", () => {
    const problems = assessArchiveCounts({
      verifiedCount: 100,
      bucketCount: 120,
      unarchivedRawCount: 0,
      incompleteMetadataCount: 0,
      requireComplete: true,
      requireCountParity: false,
    });
    expect(problems).toEqual([]);
  });
});
