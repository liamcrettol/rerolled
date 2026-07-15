# Beta scaling checklist

Status: executed 2026-07-15. The Rerolled Crucible split, database cleanup,
Rival reconciliation schedule, and 400 MB capacity warnings are complete.
Rerolled fell from 361 MB to 34 MB; Rival was healthy at 33 MB with 1,133
matches while its backfill continued. Supabase and Vercel paid-tier choices
remain owner decisions before a larger or commercial beta.

Why: Rerolled's Supabase database is at **361MB of a 500MB free-tier cap
(72% full)**, and ~325MB of that is Crucible sync data that duplicates what
Rival now owns. That's the urgent item. Supabase/Vercel plan tier is a
capacity decision, not a code task. Bungie API rate limiting is already
handled correctly in the code and needs no changes.

---

## 1. Cut Crucible out of Rerolled (repo: rerolled) — DO THIS FIRST

This is Phase 5 of `docs/plans/core-slim-and-h2h-split.md`, now fully
scoped. Rival (rival.d2roulette.app) is live, verified working (Bungie
sign-in, cron backfill, head-to-head all confirmed end-to-end), and owns
this feature now. Rerolled's copy is dead weight actively growing its
database and duplicating Bungie API polling for the same users.

### What exists right now (verified 2026-07-15)

- `lib/crucible/` (headToHead.ts, historyClient.ts, importMatch.ts,
  matchHistory.ts, modes.ts, queueSync.ts, sync.ts, syncCronHealth.ts,
  types.ts)
- `lib/pgcr/` (archive.ts, reconcile.ts, service.ts)
- `lib/scoreAttack/pgcr.ts` and `lib/scoreAttack/types.ts` (the PGCR parser;
  only `lib/crucible/*` imports these — everything else that used to import
  from `lib/scoreAttack` was deleted in earlier phases)
- `app/api/crucible/` (head-to-head, matches, refresh, sync)
- `app/api/cron/sync-crucible/`, `app/api/cron/backfill-crucible-results/`,
  `app/api/cron/reclassify-crucible/`, `app/api/cron/reconcile-pgcr/`
- `app/api/internal/repair-crucible/` (check if still present; grep to
  confirm before assuming)
- `components/CrucibleHistorySync.tsx` — still mounted on
  `app/dashboard/page.tsx`
- `queueCrucibleSync` called from `app/dashboard/page.tsx` and
  `app/api/auth/bungie/callback/route.ts`
- pg_cron jobs live in the database right now: `ping-sync-crucible`,
  `ping-reconcile-pgcr` (both must be unscheduled)
- Database tables: `crucible_matches`, `crucible_match_players`,
  `crucible_match_viewers`, `crucible_encounters`, `crucible_sync_state`
  (~325MB combined)
- Orphan-once-crucible-is-gone tables: `challenge_runs` (5 rows),
  `challenge_run_participants` (5 rows), `challenge_run_loadout_slots`
  (9 rows), `weekly_challenges` (2 rows), `weekly_challenge_versions`
  (2 rows), `seasons` (1 row) — confirmed via grep that
  `lib/crucible/matchHistory.ts` is the ONLY code anywhere in the repo that
  references these table names. `lib/challenges/` no longer exists (already
  deleted in an earlier phase). Drop all six once crucible is gone.

### Steps

1. **Confirm Rival is still healthy** before deleting anything (this is a
   one-way trip for Rerolled's copy of the data — Rival's database is the
   only place H2H data will live afterward): sign in on
   `rival.d2roulette.app`, confirm the dashboard shows match history, check
   `crucible_sync_state.status` isn't stuck on `failed`.

2. **Grep for every remaining import** of the modules being deleted before
   touching anything:
   ```
   grep -rln "lib/crucible\|lib/pgcr\|lib/scoreAttack" app components lib --include=*.ts --include=*.tsx
   ```
   Everything that shows up outside `lib/crucible/*` and
   `lib/scoreAttack/pgcr.ts`/`types.ts` needs a look before deleting (there
   shouldn't be any, per the audit above, but re-verify since time may have
   passed).

3. **Delete the code**:
   - `lib/crucible/`, `lib/pgcr/`, `lib/scoreAttack/`
   - `app/api/crucible/`
   - `app/api/cron/sync-crucible/`, `app/api/cron/backfill-crucible-results/`,
     `app/api/cron/reclassify-crucible/`, `app/api/cron/reconcile-pgcr/`
   - `app/api/internal/repair-crucible/` (if it exists)
   - `components/CrucibleHistorySync.tsx`, `components/crucible/` (if it
     still exists; may already be gone from Phase 2)
   - Any tests under `__tests__/lib/crucible/`, `__tests__/lib/pgcr/`,
     `__tests__/lib/scoreAttack/`, `__tests__/api/*crucible*`

4. **Strip the two call sites**:
   - `app/dashboard/page.tsx`: remove the `CrucibleHistorySync` import/JSX
     and the `queueCrucibleSync` import/call.
   - `app/api/auth/bungie/callback/route.ts`: remove the
     `queueCrucibleSync(...)` call and its import.

5. **Revert `lib/bungie/pgcr.ts`'s cache path** to a plain `pgcr_cache`
   read/write. It currently goes through `lib/pgcr/service.ts` for the
   Appwrite archive indirection — that whole module is being deleted, so
   `pgcr.ts` needs to talk to Supabase directly again, the way it did before
   the H2H work started. `pgcr_cache` itself **stays** (roulette's own match
   detection depends on it); only the Appwrite layering goes.

6. **Re-enable `pgcr_cache` pruning.** Look at migration `052_prune_pgcr_cache.sql`
   for the original pruning logic and `057_disable_pgcr_prune.sql` for why
   and how it was disabled (it was turned off specifically because H2H
   needed `pgcr_cache` to be durable; that's no longer true once Rerolled
   doesn't own H2H). Write a new migration that re-enables it — check
   whether 057 dropped a cron job or a function and reverse exactly that.

7. **Database migration** (new file, next number after whatever's latest —
   check `ls supabase/migrations/ | tail -5` before writing it):
   - `drop table if exists crucible_encounters;`
   - `drop table if exists crucible_match_players;`
   - `drop table if exists crucible_match_viewers;`
   - `drop table if exists crucible_matches;`
   - `drop table if exists crucible_sync_state;`
   - `drop table if exists challenge_run_loadout_slots;`
   - `drop table if exists challenge_run_participants;`
   - `drop table if exists challenge_runs;`
   - `drop table if exists weekly_challenge_versions;`
   - `drop table if exists weekly_challenges;`
   - `drop table if exists seasons;`
   - Before writing the drops, run
     `select pg_describe_object(classid, objid, objsubid) from pg_depend where refobjid = '<table>'::regclass and deptype = 'n';`
     for each table to check for FK dependents not already accounted for
     here, same pattern used in migrations 059-062. Order matters: drop
     children (`challenge_run_participants`, `challenge_run_loadout_slots`)
     before `challenge_runs`; drop `weekly_challenge_versions` before
     `weekly_challenges`; drop `challenge_runs`/`weekly_challenges` before
     `seasons` (both FK into it).
   - Add: `select cron.unschedule('ping-sync-crucible');` and
     `select cron.unschedule('ping-reconcile-pgcr');` (wrap in a check like
     migration 059's `if exists (select 1 from cron.job where jobname = ...)`
     so it's safe to re-run).
   - **Run it against the live database** with
     `node scripts/db-query.mjs supabase/migrations/0XX_drop_crucible.sql`
     and confirm the tables are gone with
     `select tablename from pg_tables where schemaname='public' and tablename like '%crucible%'`.
   - Confirm the DB shrank: `select pg_size_pretty(pg_database_size(current_database()));`

8. **Vercel env vars**: remove `APPWRITE_ENDPOINT`, `APPWRITE_PROJECT_ID`,
   `APPWRITE_API_KEY`, `APPWRITE_PGCR_BUCKET_ID`, `PGCR_ARCHIVE_READS`,
   `PGCR_ARCHIVE_WRITES`, `PGCR_ARCHIVE_CLEAR_VERIFIED` from Rerolled's
   Vercel project (Production and Preview) — nothing reads them once
   `lib/pgcr/` is deleted.

9. **Docs**: update `CLAUDE.md` — remove the H2H/score-attack/Appwrite
   references, and add a line noting Rival exists and owns match
   history/head-to-head now. Move
   `docs/crucible-head-to-head-implementation.md` and `docs/pgcr-archive.md`
   out (they describe Rival's architecture now, not Rerolled's) — either
   delete them from this repo or leave a one-line pointer to
   `github.com/liamcrettol/rival`.

10. **Add the cross-link** (this is Phase 6 from the original plan, small
    enough to bundle here): somewhere on Rerolled's dashboard, add a link to
    `https://rival.d2roulette.app` ("View your match history & head-to-head
    records"). No shared session needed — it's just a link.

11. **Verify**: `npm test`, `npx tsc --noEmit`, `npm run build`, all green.
    Manually create a lobby, roll, apply a loadout, and confirm match
    detection still works (that's `lib/stats/record.ts` +
    `app/api/stats/detect` — untouched by this change, but prove it).

12. **Squash to one commit, push to `main`** per the repo's normal workflow.
    This lands on staging first; promote to `release` when ready, same as
    always.

---

## 2. Supabase capacity — decision for Liam, not Codex

Codex can't upgrade a billing plan. This section is what Liam needs to
decide, plus two small coding tasks that support it.

**Decision needed, for both projects** (Rerolled's `<project-ref>` and
Rival's `gnlnoojuudcjbifjfjyr`): stay on Free tier (500MB DB cap, ~5GB
egress/month, shared compute) or upgrade to Pro (~$25/mo per project,
8GB DB included, dedicated compute, no hard cap panic). Given step 1 above
reclaims ~300MB, Rerolled's free tier is fine again short-term. Rival is at
29MB and growing with real backfill traffic — watch it, but no immediate
need.

**Recommendation**: stay on Free for both through a small/closed beta (tens
of users), revisit before a public/large beta. The real trigger isn't a
date, it's DB size — set a manual reminder to check
`select pg_size_pretty(pg_database_size(current_database()));` weekly on
both projects, or have Codex build the monitoring task below.

**Optional coding task** (genuinely useful, hand to Codex): add a scheduled
endpoint (or extend an existing cron route) that checks
`pg_database_size(current_database())` against a hardcoded threshold (e.g.
80% of 500MB = 400MB) and logs a loud warning (or pings a webhook/Slack/
email, whichever Liam already has wired up) when crossed. Same pattern as
the existing cron routes in `app/api/cron/`. Do this for both Rerolled and
Rival.

---

## 3. Vercel capacity — decision for Liam, not Codex

Same situation: both projects are on Vercel's Hobby plan (per Rerolled's own
`CLAUDE.md`). Hobby's terms of service restrict it to personal/non-commercial
use, and its resource ceilings (function execution, bandwidth) are lower
than Pro. This doesn't block a small friend-group beta, but check
`vercel.com/pricing` for current, exact limits before deciding — don't trust
a stale number here, Vercel's tiers change.

**Decision needed**: whether a "large number of users" beta counts as
outside Hobby's intended use, and whether to upgrade to Pro (~$20/mo per
member) before opening it up. This is a one-click dashboard change with no
code required — nothing for Codex to do here.

---

## What does NOT need to change

Bungie API rate limiting is already handled correctly:
`PGCR_CONCURRENCY = 4` bounds concurrent PGCR fetches, `lib/bungie/client.ts`
and `lib/bungie/pgcr.ts` handle `429`/`Retry-After` with real backoff, the
sync-crucible cron caps itself at 25 claimed users and a 35-second time
budget per invocation, and Rerolled and Rival each have their own Bungie
OAuth app so they don't share a rate-limit bucket. A beta signup spike makes
new users' history backfill slower (bounded by the cron's per-tick claim
limit), not broken. No changes needed here before beta.
