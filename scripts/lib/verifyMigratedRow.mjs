// Row-level verify-only coordinator, dependency-injected for no-network tests.
// Cleared rows are valid verification targets: their Appwrite bytes can still
// be checked against durable checksum metadata even though raw_pgcr is null.

export async function verifyMigratedRow(client, row, { verifyRawPgcr, markArchivedIfCurrent }) {
  const result = await verifyRawPgcr(row.instance_id, row.appwrite_sha256);
  if (!result.ok) return { ok: false, errorClass: "verify_mismatch" };

  if (row.payload !== null) {
    const reconfirmed = await markArchivedIfCurrent(client, row.instance_id, row.appwrite_sha256, false);
    if (!reconfirmed) return { ok: false, errorClass: "guard_rejected_concurrent_write" };
  }

  return { ok: true, bytes: result.bytes };
}
