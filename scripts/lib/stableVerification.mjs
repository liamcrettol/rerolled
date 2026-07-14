const STATE_SQL = `select
  count(*) filter (where appwrite_migrated_at is not null) as verified_count,
  count(*) filter (
    where raw_pgcr is not null and appwrite_migrated_at is null
  ) as unarchived_raw_count,
  count(*) filter (
    where appwrite_migrated_at is not null
      and (
        appwrite_sha256 is null
        or appwrite_sha256 !~ '^[0-9a-f]{64}$'
        or appwrite_bytes is null
        or appwrite_bytes < 0
        or appwrite_last_verified_at is null
      )
  ) as incomplete_metadata_count
from pgcr_cache`;

export async function readVerificationState(client) {
  const { rows: [state] } = await client.query(STATE_SQL);
  return state;
}

// Capture the cleanup target in one short-lived, read-only MVCC snapshot.
// The transaction is committed before any network downloads begin.
export async function captureFullVerificationTarget(client) {
  await client.query("begin transaction isolation level repeatable read read only");
  try {
    const state = await readVerificationState(client);
    const { rows: targets } = await client.query(
      `select instance_id, appwrite_sha256, appwrite_bytes
       from pgcr_cache
       where appwrite_migrated_at is not null
       order by instance_id`,
    );
    await client.query("commit");
    return { state, targets };
  } catch (err) {
    try {
      await client.query("rollback");
    } catch {
      // Preserve the capture error; connection cleanup still happens in main.
    }
    throw err;
  }
}

export function chooseEvenlySpacedIds(ids, requested) {
  if (requested >= ids.length) return [...ids];
  if (requested <= 0 || ids.length === 0) return [];
  return Array.from({ length: requested }, (_, index) => {
    const sourceIndex = Math.floor(((index + 0.5) * ids.length) / requested);
    return ids[Math.min(sourceIndex, ids.length - 1)];
  });
}

// Re-check bucket IDs outside the frozen target against current DB state.
// New/in-flight rows are legitimate extras; an ID with no durable raw or
// migrated row is a true orphan/inconsistent object.
export async function findUnaccountedBucketIds(client, extraIds, batchSize = 500) {
  const unaccounted = [];
  for (let offset = 0; offset < extraIds.length; offset += batchSize) {
    const chunk = extraIds.slice(offset, offset + batchSize);
    const { rows } = await client.query(
      `select instance_id,
              raw_pgcr is not null as has_raw,
              appwrite_migrated_at is not null as is_migrated
       from pgcr_cache
       where instance_id = any($1::text[])`,
      [chunk],
    );
    const accounted = new Set(
      rows
        .filter((row) => row.has_raw === true || row.is_migrated === true)
        .map((row) => row.instance_id),
    );
    for (const id of chunk) {
      if (!accounted.has(id)) unaccounted.push(id);
    }
  }
  return unaccounted;
}
