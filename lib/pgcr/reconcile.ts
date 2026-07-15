import { adminSupabase } from "@/lib/supabase/admin";
import { archiveStoredRawPgcr, type ArchiveOutcome } from "./service";

// Supabase's generated schema is intentionally not checked in.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

interface PendingArchiveRow {
  instance_id: string;
}

export interface ReconcileFailure {
  instanceId: string;
  kind: string;
  message: string;
}

export interface ReconcileResult {
  selected: number;
  attempted: number;
  archived: number;
  cleared: number;
  failed: number;
  deferred: number;
  remaining: number;
  failures: ReconcileFailure[];
  durationMs: number;
}

export interface ReconcileOptions {
  limit?: number;
  concurrency?: number;
  timeBudgetMs?: number;
}

interface ReconcileDependencies {
  db?: Db;
  archiveOne?: (instanceId: string) => Promise<ArchiveOutcome>;
  now?: () => number;
}

async function countPending(db: Db): Promise<number> {
  const { count, error } = await db
    .from("pgcr_cache")
    .select("instance_id", { count: "exact", head: true })
    .not("raw_pgcr", "is", null)
    .is("appwrite_migrated_at", null);

  if (error) throw new Error(`PGCR reconciliation count failed: ${error.message ?? error}`);
  return count ?? 0;
}

async function listPending(db: Db, limit: number): Promise<PendingArchiveRow[]> {
  const { data, error } = await db
    .from("pgcr_cache")
    .select("instance_id")
    .not("raw_pgcr", "is", null)
    .is("appwrite_migrated_at", null)
    .order("fetched_at", { ascending: true, nullsFirst: true })
    .order("instance_id", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`PGCR reconciliation selection failed: ${error.message ?? error}`);
  return (data ?? []) as PendingArchiveRow[];
}

/**
 * Retry a bounded set of Supabase outbox rows. Work starts in small chunks so
 * a Vercel invocation stops accepting new Appwrite operations before its hard
 * timeout while already-started operations are still awaited.
 */
export async function reconcilePendingPgcrs(
  options: ReconcileOptions = {},
  dependencies: ReconcileDependencies = {},
): Promise<ReconcileResult> {
  const limit = Math.max(1, Math.min(options.limit ?? 40, 100));
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 4, 8));
  const timeBudgetMs = Math.max(1_000, Math.min(options.timeBudgetMs ?? 35_000, 45_000));
  const db = dependencies.db ?? adminSupabase;
  const now = dependencies.now ?? Date.now;
  const archiveOne = dependencies.archiveOne
    ?? ((instanceId: string) => archiveStoredRawPgcr(instanceId, { db }));
  const startedAt = now();
  const rows = await listPending(db, limit);
  const failures: ReconcileFailure[] = [];
  let attempted = 0;
  let archived = 0;
  let cleared = 0;

  for (let offset = 0; offset < rows.length; offset += concurrency) {
    if (now() - startedAt >= timeBudgetMs) break;
    const chunk = rows.slice(offset, offset + concurrency);
    const outcomes = await Promise.all(chunk.map(async (row) => ({
      row,
      outcome: await archiveOne(row.instance_id),
    })));

    attempted += outcomes.length;
    for (const { row, outcome } of outcomes) {
      if (outcome.archived) {
        archived++;
        if (outcome.cleared) cleared++;
        continue;
      }
      failures.push({
        instanceId: row.instance_id,
        kind: outcome.archiveError?.kind ?? "guard_rejected",
        message: outcome.archiveError?.message ?? "The source payload changed while it was being archived.",
      });
    }
  }

  const remaining = await countPending(db);
  return {
    selected: rows.length,
    attempted,
    archived,
    cleared,
    failed: failures.length,
    deferred: rows.length - attempted,
    remaining,
    failures,
    durationMs: now() - startedAt,
  };
}
