# Raw PGCR archive (Supabase -> Appwrite Storage)

## Why this exists

Raw PGCR (Post Game Carnage Report) JSON documents are the source-of-truth
data behind H2H (`crucible_matches`/`crucible_encounters`) and Score Attack
(`normalized_pgcr`, scoring, compliance, legality, badges). They are
**cornerstone, permanent data**, not a disposable cache, even though the
table that stores them is named `pgcr_cache` for historical reasons.

`pgcr_cache.raw_pgcr` (jsonb) grew large enough to threaten the Supabase plan
limit. Migration 052 (`prune_pgcr_cache()`) tried to bound that growth by
deleting rows - that was a bug in intent: it was deleting the same durable
data described above. Live inspection confirmed the function was not just
present but actively running (calls recorded in `pg_stat_statements`,
substantial deletions recorded in `pg_stat_user_tables`), invoked at the end
of every `sync-crucible` cron run. Migration 057 neutralizes it to a no-op
and the cron call site is removed in the same change.

The durable replacement is this archive: raw PGCR bytes move to a private
Appwrite Storage bucket (`pgcr-archive`), addressed deterministically by
Destiny `instance_id`. **Supabase remains the primary relational database** -
PostgREST, RPCs, Realtime, pg_cron, pg_net, and Vault are untouched, and
`normalized_pgcr` (everything Score Attack/H2H reads at request time) stays
exactly where it is. Only the raw JSON blob moves.

## Architecture

- **Supabase (`pgcr_cache`)** stays the durable *write-first* copy of every
  raw PGCR (the "outbox"), plus all relational metadata: `normalized_pgcr`,
  `status`, `fetched_at`, and the new `appwrite_*` bookkeeping columns
  (migration 058). A row's `raw_pgcr` is only ever nulled after that exact
  payload has been uploaded to and checksum-verified in Appwrite - never
  speculatively, never as a side effect of anything else.
- **Appwrite Storage** (private bucket `pgcr-archive`) holds the complete raw
  PGCR as opaque UTF-8 JSON bytes. The file ID is always the `instance_id` -
  there is no separate ID-mapping column, the mapping is the identity
  function. Server-only access via the `node-appwrite` SDK and an API key;
  the bucket has no public read permissions.
- **`lib/pgcr/archive.ts`** is the only module allowed to import
  `node-appwrite`. It is a thin, server-only, create-only object store
  adapter (upload/download/verify/exists), lazily initialized so `next build`
  never requires `APPWRITE_*` to be set.
- **`lib/pgcr/service.ts`** is the single place that coordinates Supabase and
  Appwrite - reads, writes, checksums, and the atomic metadata-stamp-and-
  optional-clear (via migration 058's `mark_pgcr_archived_if_current` RPC).
  Every application code path that needs a raw PGCR goes through this
  module, not through Supabase or Appwrite directly.
- **`mark_pgcr_archived_if_current`** (Postgres function, migration 058) is
  the single, atomic, concurrency-safe place that ever writes `appwrite_*`
  metadata or nulls `raw_pgcr`. It recomputes `encode(sha256(convert_to(raw_pgcr::text,
  'UTF8')), 'hex')` inside the same guarded `UPDATE` and only touches a row
  when that matches the checksum the caller just verified against Appwrite -
  stamping metadata and (optionally) clearing happen in the same statement,
  never as two separate steps a concurrent write could interleave with. Both
  `lib/pgcr/service.ts` and the CLI scripts call this RPC and check its
  returned boolean; a `false` means "a concurrent write happened, this row
  was not touched, and it must not be reported as archived/cleared."

```
                       ┌────────────────────┐
   app code  ───────▶  │ lib/pgcr/service.ts│
 (pgcr.ts, worker      │  readRawPgcr()     │
  detection.ts, ...)   │  persistRawPgcr()  │
                       └─────────┬──────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                                ▼
      lib/pgcr/archive.ts               Supabase pgcr_cache
      (node-appwrite, private            raw_pgcr (outbox copy
       bucket "pgcr-archive")             until verified+cleared),
                                          normalized_pgcr, appwrite_* metadata
```

Two standalone CLI scripts share the same upload/verify primitives (via
`scripts/lib/pgcrArchiveCore.mjs`, a plain-JS mirror of `archive.ts` for
scripts that run outside the Next.js/ts-jest toolchain - see
`scripts/db-query.mjs`'s existing convention), plus a shared bounded
keyset-pagination engine (`scripts/lib/reconcileSweep.mjs`) and shared
archive/clear row logic (`scripts/lib/reconcileRows.mjs`), both unit-tested
with fakes so the pagination/termination and checksum-guard behavior is
verified without a live database or Appwrite connection:

- `scripts/migrate-pgcr-to-appwrite.mjs` - one-time historical backlog drain.
- `GET /api/cron/reconcile-pgcr` - the permanent, bounded production outbox
  retry. Supabase pg_cron invokes it every five minutes via migration 059.
- `scripts/reconcile-pgcr-archive.mjs` - the operator sweep for migrations,
  full backlog repair, and separately approved verified-payload clearing. It
  runs up to two independent bounded sweeps - see "Reconciliation" below.

## Feature flags

All default to **disabled**. Only the literal string `"1"` enables a flag;
anything else (unset, `"true"`, `"0"`) is treated as disabled.

| Flag | Effect when `1` |
|---|---|
| `PGCR_ARCHIVE_WRITES` | New writes are archived to Appwrite (uploaded, downloaded back, checksum-verified, metadata stamped) in addition to the always-on Supabase write. |
| `PGCR_ARCHIVE_READS` | Reads try Appwrite first, falling back to Supabase's `raw_pgcr` on a miss or transient error. With this off, behavior is byte-identical to before this feature existed: Supabase only. |
| `PGCR_ARCHIVE_CLEAR_VERIFIED` | Once a write is verified in Appwrite, `raw_pgcr` is nulled for that row via a concurrency-safe, checksum-guarded update. **Never enable this before 100% verification and separate explicit approval** - see the cleanup section below. |

## Required server environment variables

```
APPWRITE_ENDPOINT=
APPWRITE_PROJECT_ID=
APPWRITE_PGCR_BUCKET_ID=pgcr-archive
APPWRITE_API_KEY=
```

All four are **server-only**. Never create a `NEXT_PUBLIC_APPWRITE_*`
variable, never log their values, and never let the API key reach a client
bundle - `lib/pgcr/archive.ts` is the only module that touches
`node-appwrite`, and nothing in `app/**/page.tsx`, `"use client"` files, or
anything shipped to the browser imports it. The bucket itself must stay
private (no read permissions) - Appwrite access is always authenticated via
the server-side API key, never a public bucket policy.

## Safe rollout order

1. **Apply the no-op pruning migration** (`057_disable_pgcr_prune.sql`) -
   stops the active deletion immediately, before anything else changes. Keeps
   the function callable (for any already-deployed code still invoking it via
   RPC) but makes it return `0` and touch nothing.
2. **Deploy this code with all three `PGCR_ARCHIVE_*` flags disabled.**
   Behavior is unchanged from before - this is a no-op deploy from the
   application's point of view, purely to get the (dormant) code live.
3. **Apply the metadata migration** (`058_pgcr_appwrite_metadata.sql`) - adds
   `appwrite_sha256`/`appwrite_bytes`/`appwrite_migrated_at`/
   `appwrite_last_verified_at`, the disjoint archive/clear partial indexes,
   and the atomic `mark_pgcr_archived_if_current` RPC.
4. **Enable `PGCR_ARCHIVE_WRITES=1` only.** New PGCRs start getting archived
   as they're written; nothing is read from Appwrite yet, nothing is cleared.
   Watch for `[pgcr-archive]` warnings in logs.
5. **Run the historical migration in `--dry-run` mode** and review the
   reported counts/sizes before touching anything real.
6. **Run the historical migration for real, after explicit approval** -
   `node scripts/migrate-pgcr-to-appwrite.mjs`. Resumable; safe to interrupt
   and rerun.
7. **Verify 100%** with `scripts/verify-pgcr-archive.mjs --full --sample 200`
   (see below). Do not proceed past this step with any unresolved conflict or
   missing object.
8. **Enable `PGCR_ARCHIVE_READS=1`.** Reads now prefer Appwrite; Supabase
   remains a live fallback the whole time.
9. **Bake and monitor** - watch `[pgcr-archive]` logs, the reconciliation
   sweep's counters, and Sentry for conflict-class errors, for a real
   observation window before going further.
10. **Only later, after a separate explicit approval, enable
    `PGCR_ARCHIVE_CLEAR_VERIFIED=1`** (and/or run
    `scripts/reconcile-pgcr-archive.mjs --clear-verified
    --confirm-clear-verified-payloads`). This is the only step in this whole
    rollout that removes data from Postgres, and it only ever removes a
    payload that has already been byte-verified in Appwrite.

This implementation pass stops at step 6-7 (code, migrations-as-files, and
dry-run tooling exist; nothing has been applied or run against production).
Steps 1, 3, 6, and 10 all require someone to actually execute something
against the live database/bucket - none of that happened here.

## Historical migration

```
node scripts/migrate-pgcr-to-appwrite.mjs --dry-run
node scripts/migrate-pgcr-to-appwrite.mjs
node scripts/migrate-pgcr-to-appwrite.mjs --batch 200 --concurrency 4 --limit 5000
node scripts/migrate-pgcr-to-appwrite.mjs --verify-only
```

- Keyset-paginates `pgcr_cache` (`WHERE raw_pgcr IS NOT NULL AND
  appwrite_migrated_at IS NULL ORDER BY instance_id`), so memory use is
  bounded to one batch regardless of table size.
- Selects `raw_pgcr::text` so the archived bytes are Postgres's own exact
  rendering, not a re-serialization - this is the same "one definition of the
  bytes" the live write path uses (see `lib/pgcr/service.ts`).
- Create-only upload; a 409 triggers a download-and-checksum reconciliation
  (matching bytes = idempotent success, mismatched bytes = a hard conflict
  that is logged and left unmarked, never resolved by overwriting either
  copy).
- Every upload (and every pre-existing 409 match) is verified by downloading
  it back and comparing SHA-256, then stamped via the same atomic
  `mark_pgcr_archived_if_current` RPC the live app and the reconciliation
  script use (`p_clear_raw = false`) - never a separate, unguarded `UPDATE`.
  A `false` return (the checksum guard rejected a concurrent write) is
  treated as a failure for that row, not a false success.
- **Never clears `raw_pgcr`.** This script only adds a second, verified copy.
- Resumable by construction: `appwrite_migrated_at IS NULL` is the work
  queue, so interrupting and rerunning simply picks up where it left off.
- `--verify-only` re-walks already-migrated rows and re-checks their
  checksums without touching anything unmigrated.
- Failures/conflicts are written to `pgcr-migration-failures.jsonl` in the
  repo root as `{instanceId, errorClass}` lines only - no payload contents,
  no secrets.
- Exits non-zero if anything failed or conflicted.

## Reconciliation (the permanent replacement for pruning)

Production continuously retries ordinary archive failures through
`GET /api/cron/reconcile-pgcr`. Each invocation selects at most 40 oldest
unarchived raw rows, uploads in chunks of four, and stops starting new work
after 35 seconds. It uses `lib/pgcr/service.ts`'s same create-only upload,
download verification, and atomic `mark_pgcr_archived_if_current` RPC as live
writes. Migration 059 schedules the endpoint every five minutes through
Supabase pg_cron, so this lifecycle has no GitHub Actions dependency.

The CLI remains available for a deliberate full sweep or dry-run:

```
node scripts/reconcile-pgcr-archive.mjs --dry-run
node scripts/reconcile-pgcr-archive.mjs
node scripts/reconcile-pgcr-archive.mjs --limit 500   # bounded sweep, e.g. for a scheduled invocation
node scripts/reconcile-pgcr-archive.mjs --clear-verified --confirm-clear-verified-payloads
```

A single invocation runs up to **two fully independent bounded sweeps**,
each with its own keyset cursor and its own selection criteria - this is a
deliberate design point, not an implementation detail: archiving and
clearing operate over **disjoint row sets**, and conflating them into one
query (an earlier draft of this feature did) makes rows that were archived
by a *different* run permanently invisible to the clear step, since a query
filtered on `appwrite_migrated_at IS NULL` can never match a row that
already has `appwrite_migrated_at` set.

- **ARCHIVE sweep** (always runs): `WHERE raw_pgcr IS NOT NULL AND
  appwrite_migrated_at IS NULL`. Same upload/verify/stamp lifecycle as the
  migration script (and literally the same `mark_pgcr_archived_if_current`
  RPC, called with `p_clear_raw = false`). Never clears `raw_pgcr`.
- **CLEAR sweep** (only with **both** `--clear-verified` and
  `--confirm-clear-verified-payloads` - passing only one is refused
  outright): `WHERE raw_pgcr IS NOT NULL AND appwrite_migrated_at IS NOT
  NULL AND appwrite_sha256 IS NOT NULL` - the complement of the archive
  sweep's predicate, so rows migrated by *this run's* archive sweep, an
  earlier reconcile run, or `scripts/migrate-pgcr-to-appwrite.mjs` are all
  reachable. For each row it **re-downloads the Appwrite object** (never
  trusts the stored metadata alone), checksums it against the stored
  `appwrite_sha256`, **independently** checksums the row's *current*
  Supabase `raw_pgcr::text` against that same value (catching a payload that
  drifted since it was archived), and only then calls
  `mark_pgcr_archived_if_current` with `p_clear_raw = true`.

Both sweeps are bounded and terminate on their own
(`scripts/lib/reconcileSweep.mjs`): each walks its query once from its
cursor's starting point to the end (or to `--limit`), advancing the cursor
after every fetched page **regardless of whether individual rows in it
succeeded or failed**. This is what makes an unbounded (no `--limit`)
`--dry-run` terminate instead of looping forever, and what stops a single
permanently-failing row from blocking every row after it within one run - a
later invocation simply re-queries from the start and retries whatever's
still eligible. See `__tests__/scripts/reconcileSweep.test.ts` and
`reconcileRows.test.ts` for the specific termination/non-blocking/checksum-
guard cases this covers.

This whole mechanism - archive sweep plus the separately-gated clear sweep -
is what prevents Postgres from silently re-accumulating raw PGCR bytes
forever after the historical backlog is drained: it's a permanent, bounded
process, not a one-time migration.

## Verification

```
node scripts/verify-pgcr-archive.mjs                        # count parity + a 25-row sample
node scripts/verify-pgcr-archive.mjs --sample 200
node scripts/verify-pgcr-archive.mjs --full                 # every verified row's object actually exists
node scripts/verify-pgcr-archive.mjs --full --sample 200 --parse-check
```

- Compares Supabase's `appwrite_migrated_at IS NOT NULL` row count against
  the bucket's **actual paginated file count** (via the Appwrite API,
  cursor-paginated) - never trusts the Appwrite console's displayed total on
  its own.
- `--full` walks every verified row and confirms its Appwrite object exists
  (a verified-but-missing row is flagged as an integrity error, distinct from
  an ordinary "not archived yet" state).
- `--sample N` downloads N random verified rows, checksums them against
  `appwrite_sha256`, and confirms they parse as JSON.
- `--parse-check` (with `--sample`) additionally runs the real
  `parsePgcr()` (via a small `tsx` subprocess - `scripts/lib/parseCompare.mts`
  - since this script itself is plain `.mjs`) against both the archived and
  Supabase copies of each sampled row and confirms they normalize
  identically.
- Exits non-zero on any conflict, missing object, or checksum failure. This
  is the gate for "100% verification" before any cleanup step.

## Failure recovery

- **Appwrite write fails during normal operation:** `raw_pgcr` is left
  exactly as written to Supabase; `persistRawPgcr` returns
  `archived: false` and logs a `[pgcr-archive]` warning. The scheduled
  `/api/cron/reconcile-pgcr` worker retries it. Nothing user-facing breaks -
  Supabase was always the durable copy for that row.
- **Appwrite read fails during normal operation:** `readRawPgcr` falls back
  to Supabase automatically. If a row was previously verified
  (`appwrite_migrated_at` set) and Appwrite still returns 404, that is logged
  as `[pgcr-archive] INTEGRITY: ...` - loud, not swallowed - because it should
  never happen given the archive never deletes objects itself.
- **A row is genuinely missing from both sides** (should only be possible if
  `PGCR_ARCHIVE_CLEAR_VERIFIED` was enabled and something went wrong outside
  this system's control): PGCRs are immutable and permanently fetchable from
  Bungie by `instance_id`, so a targeted Bungie re-fetch is always the last
  resort, independent of either store.

## Rollback

- Before `PGCR_ARCHIVE_CLEAR_VERIFIED` is ever enabled, rollback is trivial:
  set all three flags back to disabled (or just leave `PGCR_ARCHIVE_READS`
  and `PGCR_ARCHIVE_CLEAR_VERIFIED` off) and every code path is exactly what
  it was before this feature existed - Supabase's `raw_pgcr` was never
  touched.
- After clearing has run for some rows, rehydration is: download the object
  from Appwrite (`getRawPgcrBytes`/`getRawPgcr`) and write it back to
  `pgcr_cache.raw_pgcr` for that `instance_id`. A small rehydration script
  mirroring the migration script's logic in reverse is straightforward to add
  when/if this is ever needed - not built in this pass since no clearing has
  happened yet.
- A full `pg_dump --table=pgcr_cache` backup taken immediately before enabling
  `PGCR_ARCHIVE_CLEAR_VERIFIED` is the blunt-instrument fallback.

## What future SQL migrations lose

Migrations 050, 051, and 055 all queried `raw_pgcr` directly in SQL (`cross
join lateral jsonb_array_elements(c.raw_pgcr->'entries') entry`, etc.) to
backfill columns from historical PGCR data in-database. **Once a row's
`raw_pgcr` is cleared, that pattern is no longer possible for that row** - the
JSON only exists in Appwrite from that point on, reachable only via
`lib/pgcr/service.ts`/`lib/pgcr/archive.ts` from application code, not from a
SQL migration running inside Postgres. Any future backfill that needs raw PGCR
fields must be an application-level script (like
`scripts/migrate-pgcr-to-appwrite.mjs`'s shape: paginate `pgcr_cache`,
download+parse from Appwrite where `raw_pgcr` is null, write the derived
columns back), not a plain `.sql` file. This is a real, permanent trade-off of
this migration, not an oversight - flagging it here so it doesn't get
rediscovered the hard way.

## What this implementation pass does NOT include

The following require separate, explicit approval and are **not** part of
this change:

- Applying migrations 057/058 to production.
- Running the historical migration against production data.
- Enabling any `PGCR_ARCHIVE_*` flag in a deployed environment.
- Clearing (nulling) any `raw_pgcr` payload, anywhere.
- `VACUUM`/`VACUUM FULL` or any other disk-reclaim step.
- Any change to Vercel or Appwrite project/bucket settings.

## Inventory: every `pgcr_cache`/`raw_pgcr`/`normalized_pgcr` access path

| Location | Classification | Status after this change |
|---|---|---|
| `lib/pgcr/archive.ts` | Raw-document storage (low-level Appwrite adapter) | New |
| `lib/pgcr/service.ts` | Raw-document storage (coordinator) | New |
| `lib/bungie/pgcr.ts` (`getPGCR`, lobby detection + Crucible sync/backfill) | Raw-document read/write | Routed through `lib/pgcr/service.ts` |
| `lib/scoreAttack/worker/detection.ts` (`fetchPgcrHandler`, `parsePgcrHandler`) | Raw-document read/write (fetch), normalized write (parse) | `fetchPgcrHandler`/raw read in `parsePgcrHandler` routed through the service; `normalized_pgcr` write unchanged |
| `lib/scoreAttack/worker/detection.ts` (score/compliance/legality handlers), `lib/scoreAttack/worker/handlers.ts`, `lib/scoreAttack/worker/participantBadgeContext.ts`, `lib/stats/season.ts` | Normalized-document reads (Score Attack, badges, season history, H2H display) | **Unchanged** - stay direct Supabase reads of `normalized_pgcr`, as required |
| `app/api/cron/backfill-crucible-results/route.ts` | Maintenance (self-described one-time, still present) | Raw reads routed through the service so it keeps working once rows start getting cleared |
| `app/api/cron/sync-crucible/route.ts` | Maintenance (was: prune RPC call) | Prune call removed |
| `app/api/cron/reconcile-pgcr/route.ts`, `lib/pgcr/reconcile.ts` | Scheduled Appwrite outbox retry | New; invoked by Supabase pg_cron migration 059 |
| `supabase/migrations/028_pgcr_worker_infra.sql` | Schema | Unchanged (original table definition) |
| `supabase/migrations/050_crucible_player_emblems.sql`, `051_crucible_global_names_and_results.sql`, `055_crucible_director_activity.sql` | Historical migrations (SQL over `raw_pgcr`) | Unchanged, already applied - see "What future SQL migrations lose" above for why this pattern can't be reused |
| `supabase/migrations/052_prune_pgcr_cache.sql` | Maintenance (destructive) | Superseded by `057_disable_pgcr_prune.sql`; original file left as historical record |
| `supabase/migrations/057_disable_pgcr_prune.sql` | Maintenance (protective) | New |
| `supabase/migrations/058_pgcr_appwrite_metadata.sql` | Schema | New |
| `scripts/migrate-pgcr-to-appwrite.mjs`, `scripts/reconcile-pgcr-archive.mjs`, `scripts/verify-pgcr-archive.mjs`, `scripts/lib/pgcrArchiveCore.mjs`, `scripts/lib/reconcileSweep.mjs`, `scripts/lib/reconcileRows.mjs`, `scripts/lib/parseCompare.mts` | Migration/maintenance tooling | New |
| `__tests__/lib/bungie/pgcr.test.ts`, `pgcrCache.test.ts`, `__tests__/lib/scoreAttack/worker.test.ts`, `detection.test.ts` | Test usage | Unchanged (still pass with all flags disabled - see below) |
| `__tests__/lib/pgcr/archive.test.ts`, `service.test.ts`, `__tests__/scripts/reconcileSweep.test.ts`, `reconcileRows.test.ts` | Test usage | New |
