// Pure cleanup-gate checks used by verify-pgcr-archive.mjs and unit tests.

export function assessArchiveCounts({
  verifiedCount,
  unarchivedRawCount,
  incompleteMetadataCount,
  bucketCount,
  requireComplete,
  requireCountParity = true,
}) {
  const problems = [];
  if (requireCountParity && bucketCount !== verifiedCount) {
    problems.push(`Bucket/DB count mismatch: bucket=${bucketCount}, migrated rows=${verifiedCount}.`);
  }
  if (incompleteMetadataCount > 0) {
    problems.push(`${incompleteMetadataCount} migrated row(s) have incomplete or invalid archive metadata.`);
  }
  if (requireComplete && unarchivedRawCount > 0) {
    problems.push(`PARTIAL MIGRATION: ${unarchivedRawCount} row(s) still contain raw_pgcr without appwrite_migrated_at.`);
  }
  return problems;
}

export function compareArchiveIdSets(bucketFileIds, migratedIds) {
  const bucket = new Set(bucketFileIds);
  const migrated = new Set(migratedIds);
  return {
    orphans: [...bucket].filter((id) => !migrated.has(id)),
    missing: [...migrated].filter((id) => !bucket.has(id)),
  };
}
