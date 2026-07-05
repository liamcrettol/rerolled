# Challenge platform schema

Database/data foundation for Weekly Challenge, Score Attack, compliance,
leaderboards, badges, and player stats (#259, #256, #258, #257). Built
alongside Codex's execution-side work (PGCR parsing, scoring, compliance
math, worker wrappers, run lifecycle — see `lib/scoreAttack/*`); this doc
covers the schema those pieces read and write.

All tables below live in `supabase/migrations/025`–`031`. They're **additive**
— nothing here renames or alters an existing lobby/auth/roulette table.
**Not yet applied to the live database** — see the status table in
[`supabase/migrations/README.md`](../supabase/migrations/README.md) before
relying on any of this in a deployed route or worker.

## Conventions

- App-owned IDs are `uuid` (`uuid_generate_v4()`), consistent with the
  existing lobby/roll schema.
- `users.id` is the Bungie membership ID as `text` (see `001_initial.sql`) —
  every `user_id` foreign key here follows suit.
- Bungie membership IDs are stored as `text`; hashes (`item_hash`,
  `activity_hash`) and PGCR-adjacent numeric IDs are `bigint`. Never assume a
  Bungie ID fits in a JS `number` in application code.
- `created_at`/`updated_at` are `timestamptz`, defaulting to `now()`.
- Enum-like columns use `check` constraints, not Postgres `enum` types (matches
  existing style in `lobbies.status`, `lobby_rounds.status`, etc.).

## RLS posture

This app doesn't issue Supabase Auth sessions (NextAuth + a custom Bungie
provider instead), so there's no `auth.uid()` to key row-level policies off
of — the existing schema's answer to this (see `001_initial.sql`) is: RLS
enabled everywhere, `using (true)` anon-read policies on tables that are safe
to expose, and no policies at all (default deny) on tables that hold private
data, since the app's own server routes always use the service-role client
(`lib/supabase/admin.ts`, which bypasses RLS) and are responsible for their
own authorization. The challenge platform follows the same pattern:

| Table | Anon read | Writes |
|---|---|---|
| `seasons` | ✅ all | service role |
| `weekly_challenges` | ✅ non-draft only | service role |
| `weekly_challenge_versions` | ✅ if parent challenge is non-draft | service role |
| `challenge_runs` | ❌ | service role |
| `challenge_run_participants` | ❌ | service role |
| `challenge_run_loadout_slots` | ❌ | service role |
| `challenge_run_events` | ❌ | service role |
| `run_equipment_snapshots` | ❌ | service role |
| `run_compliance_results` | ❌ | service role |
| `pgcr_cache` | ❌ | service role |
| `worker_jobs` | ❌ | service role |
| `run_processing_events` | ❌ | service role |
| `weekly_leaderboard_entries` | ✅ all | service role |
| `season_leaderboard_entries` | ✅ all | service role |
| `badges` | ✅ active + not hidden | service role |
| `player_badges` | ✅ all | service role |
| `player_season_stats` / `player_weekly_stats` / `player_lifetime_stats` | ✅ all | service role |

No table here ever stores an OAuth token — those stay in `bungie_accounts`
(001_initial.sql), which already has no anon policies. Raw PGCR payloads
(`pgcr_cache.raw_pgcr`) and per-snapshot equipment data
(`run_equipment_snapshots`) are private; only the *summarized* verdict
(`compliance_status` on `weekly_leaderboard_entries` / `challenge_runs`) is
ever public.

## Tables

### Seasons & weekly challenges — `025_challenge_seasons_and_weekly_challenges.sql`

- **`seasons`** — top-level time period (`season_key` unique, `starts_at <
  ends_at`). At most one row may have `status = 'active'` (partial unique
  index on a constant expression). Depends on: #258.
- **`weekly_challenges`** — one global challenge definition per week. Belongs
  to a season, unique `slug`, unique `(season_id, week_number)`. `status`
  moves `draft → scheduled → active → expired → archived`. A check constraint
  requires `published_at`/`activity_hash`/`scoring_config`/non-empty `rules`
  once status leaves `draft` — mirrors
  `lib/challenges/validate.ts#validatePublishableChallenge`, which runs the
  same check in application code *before* the update, so the constraint is a
  backstop, not the primary UX. An exclusion constraint
  (`weekly_challenges_no_overlapping_active`, needs `btree_gist`) stops two
  `active` challenges from having overlapping `[starts_at, ends_at)` windows.
  `rules` is `WeeklyChallengeRuleSet` JSONB (see `types/challenges.ts` /
  `lib/challenges/rules.ts`); `scoring_config` is `ScoringConfig` JSONB, owned
  by Codex's scoring code. Depends on: #256, #258.
- **`weekly_challenge_versions`** — immutable snapshot taken at publish time
  (`lib/challenges/publish.ts#publishWeeklyChallenge`). `challenge_runs`
  references a specific version, so a later edit/archive/replace of the
  parent challenge never retroactively changes what an in-flight run is
  scored against. Depends on: #256.

### Runs — `026_challenge_runs.sql`

- **`challenge_runs`** — one attempt at Score Attack or a weekly challenge.
  `status` is the exact string union of
  `lib/scoreAttack/types.ts#ScoreAttackRunState` — **keep the two in sync**;
  `lib/scoreAttack/runLifecycle.ts` owns the transition rules, this table just
  stores the current state. `mode = 'weekly_challenge'` requires
  `weekly_challenge_id` + `weekly_challenge_version_id`; `mode =
  'score_attack'` requires neither. A check constraint blocks
  `status = 'finalized'` unless `score` and `compliance_status` are both set.
  Depends on: #256 (Codex), #258.
- **`challenge_run_participants`** — fireteam members present for a run.
  `unique (run_id, user_id)`.
- **`challenge_run_loadout_slots`** — the rolled 3-slot loadout for a run,
  same shape as `lobby_loadout_slots`. A trigger
  (`prevent_finalized_run_loadout_mutation`) blocks `UPDATE`/`DELETE` once the
  parent run has reached a terminal status (`finalized`, `failed`,
  `abandoned`, `expired`) — this is the "immutable after finalization"
  requirement from #259, enforced independently of which role issues the
  write.
- **`challenge_run_events`** — free-form audit trail (`event_type` + `payload`
  JSONB), optional but cheap; indexed by `(run_id, created_at)`.

### Equipment & compliance — `027_run_equipment_and_compliance.sql`

- **`run_equipment_snapshots`** — periodic captures of what a player has
  equipped mid-run. `equipped`/`expected` JSONB match
  `lib/scoreAttack/compliance.ts`'s `EquipmentSnapshotWeapon[]` /
  `RolledWeaponExpectation[]`. Never shown to players directly.
- **`run_compliance_results`** — one finalized verdict per run
  (`unique (run_id)`), `status` is the exact
  `ComplianceStatus` union (`eligible | flagged | ineligible | unknown`) from
  `lib/scoreAttack/compliance.ts`. `reasons` is the human-readable string
  array from `WeaponUsageComplianceResult`/`SnapshotComplianceResult`. Owned
  by Codex's compliance pipeline; this migration only provides storage.

### PGCR cache & worker queue — `028_pgcr_worker_infra.sql`

- **`pgcr_cache`** — keyed by `instance_id` (PGCR instance ID, `text`).
  Separates `raw_pgcr` (as Bungie returned it) from `normalized_pgcr`
  (`NormalizedPvEPgcr` shape from `lib/scoreAttack/pgcr.ts`), per #259's "keep
  raw storage separate from normalized results."
- **`worker_jobs`** — generic job queue. `job_type` is plain `text` (not a
  check constraint) so `lib/scoreAttack/types.ts#SCORE_ATTACK_JOB_TYPES` can
  grow without a migration — keep the two lists in sync in review. Column
  names mirror `ScoreAttackJob`'s camelCase fields 1:1 (`run_at` ↔ `runAt`,
  `dedupe_key` ↔ `dedupeKey`, ...) so a Supabase-backed adapter for
  `ScoreAttackJobQueue` can map straight onto this table without renaming.
  Claiming is concurrency-safe via `claim_next_worker_job` (see RPCs below),
  not a raw `UPDATE ... WHERE status = 'pending'`.
- **`run_processing_events`** — optional per-job audit trail, `(run_id,
  created_at)` indexed.

### Leaderboards — `029_leaderboards.sql`

- **`weekly_leaderboard_entries`** — one row per `(weekly_challenge_id,
  user_id)`, the user's *best* run for that challenge; the worker upserts on
  a better score. Public read. Indexed for the three access patterns in #259:
  rank order, score order, and per-user lookup.
- **`season_leaderboard_entries`** — one row per `(season_id, user_id)`,
  season-wide aggregate ranking.
- RPCs: `get_active_weekly_challenge()`, `get_weekly_leaderboard(challenge_id,
  limit, offset)`, `get_user_weekly_best(user_id, challenge_id)` — thin
  read helpers so routes don't hand-roll the same `ORDER BY` everywhere.

### Badges & stats — `030_badges_and_stats.sql`

- **`badges`** — catalog (`slug` unique, `category`, `tier`, `criteria`
  JSONB). Public read when `is_active and not is_hidden`.
- **`player_badges`** — awarded badges. Uniqueness is
  `(user_id, badge_id, scope_key)`, where `scope_key` is `'once'` for
  non-repeatable badges or a season/week identifier for repeatable ones —
  set by the awarding code (`lib/badges/evaluators.ts`), not derived in SQL,
  since it depends on `badges.is_repeatable` at award time. This is what
  makes awarding idempotent: re-running the same evaluation for the same run
  produces the same `(user_id, badge_id, scope_key)` tuple, so a
  `ON CONFLICT (user_id, badge_id, scope_key) DO NOTHING` upsert is safe to
  retry.
- **`player_season_stats` / `player_weekly_stats` / `player_lifetime_stats`**
  — denormalized aggregates, updated after run finalization (not views —
  read on every homepage/profile visit). `upsert_player_stats_after_run(run_id)`
  is a **stub**: it only increments the fields directly derivable from
  `challenge_runs` (run counts, best weekly score). Streak calculation,
  favorite-weapon lookup, and PGCR-derived kill counts belong with Codex's
  scoring/compliance pipeline, which has the actual weapon-kill data — wire
  those in there rather than duplicating PGCR parsing here.

## Publishing flow (#256)

1. `npm run weekly:generate -- --week 42 --season season-0` — deterministic
   draft (`lib/challenges/generator.ts`, seeded by `season_key:week_number`
   via FNV-1a + mulberry32 — same seed always produces the same draft),
   upserted as a `draft`-status `weekly_challenges` row.
2. `npm run weekly:preview -- --week 42 --season season-0` — same generator,
   no database access; prints the draft and any validation warnings.
3. `npm run weekly:publish -- --slug season-0-week-42 --starts ... --ends ...`
   — validates (`lib/challenges/validate.ts`, including overlap against
   currently-active challenges), snapshots into `weekly_challenge_versions`,
   and flips `status` to `scheduled`.

All three are thin CLI wrappers (`scripts/weekly-challenge.ts`, run via
`tsx`) around plain functions in `lib/challenges/publish.ts` — an admin API
route can call the same functions later without duplicating logic.

## Badge awarding flow (#257)

Badge evaluation is pure and synchronous
(`lib/badges/evaluators.ts#evaluateBadges`): given a run plus its loadout
slots, compliance result, leaderboard entry, and current streak, it returns
which of the 5 v1 badges (`weekly_clear`, `pure_roll`, `no_rerolls`,
`top_10_percent_weekly`, `three_week_streak` — seeded in
`031_challenge_platform_seed.sql`) were newly earned. `buildPlayerBadgeInsert`
turns a decision into the row to upsert. Actual invocation belongs in the
worker's `award_badges` job (see `SCORE_ATTACK_JOB_TYPES` in
`lib/scoreAttack/types.ts`) after score + compliance are both finalized — this
migration/module only provides the schema and the pure decision logic, not
the job wiring.

## Stats freshness

Denormalized tables, not views (per #258's recommendation): read-heavy
(homepage panel, profile pages), write-light (once per finalized run).
`upsert_player_stats_after_run` is called once a run reaches `finalized`;
nothing here recomputes from `challenge_runs` on every read.
