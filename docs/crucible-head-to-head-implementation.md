# Crucible Head-to-Head Implementation Guide

## Purpose

Build a Trials Report-style head-to-head counter for every supported Destiny 2 Crucible mode. When a signed-in Rerolled user views an opponent in a historical match report, show how many recorded matches they have played against that opponent, their wins and losses, and the individual games. Filters must support all Crucible, Trials, Competitive, Control, Iron Banner, and Other.

This document is written as an execution guide for a coding model with little prior knowledge of the repository. Follow the phases in order. Do not begin the UI until the database, ingestion, and query tests pass.

## Product Definition

For viewer `A` and opponent `B`, the counter means:

- `encounters`: completed Crucible matches where A and B were on opposing teams.
- `wins`: encounters won by A.
- `losses`: encounters lost by A.
- `unknown`: encounters whose PGCR does not provide a reliable result.
- `lastPlayedAt`: most recent recorded encounter.
- `mode`: a Rerolled bucket derived from the PGCR activity modes and the activity definition.

Do not count teammates as head-to-head encounters. Do not claim the data represents every game the player has ever played. The UI must say `Recorded encounters` because Bungie profile privacy, API history availability, and incomplete backfills can limit coverage.

An encounter must be idempotent. Importing the same PGCR repeatedly must never increment a counter twice.

## Existing Code to Reuse

Read these files before changing anything:

- `lib/bungie/pgcr.ts`: cached Bungie PGCR fetches and the existing activity-history request.
- `lib/scoreAttack/pgcr.ts`: `parsePgcr`, including PvP player/team normalization.
- `lib/scoreAttack/types.ts`: normalized PGCR types.
- `lib/stats/history.ts`: current Rerolled-run match history and team splitting.
- `lib/stats/season.ts`: current server-side season-history fetch.
- `components/platform/SeasonPanel.tsx`: current match report and opponent rows.
- `lib/auth/helpers.ts`: `getBungieToken` and token refresh behavior.
- `lib/auth/cron.ts`: cron authorization.
- `app/api/cron/process-jobs/route.ts`: cron route conventions.
- `supabase/migrations/028_pgcr_worker_infra.sql`: existing immutable PGCR cache.

Important constraint: the current season history only includes matches associated with `challenge_runs`. This feature must use independent Crucible history tables so normal Control, Competitive, Trials, and Iron Banner games are included even when no Rerolled challenge was active.

## Architecture

Use four new tables:

1. `crucible_matches`: one row per imported PvP PGCR.
2. `crucible_match_players`: one row per player in each imported match.
3. `crucible_encounters`: one directional row from a registered Rerolled user to each opponent in a match.
4. `crucible_sync_state`: tracks each user's backfill and incremental-sync progress.

The directional encounter table is intentional. If registered user A plays against B, store A -> B. Do not generate encounter rows for every player in the PGCR unless that player is also a registered user being synced. If B later registers, B's own history sync will safely create B -> A.

The source of truth is `crucible_matches` plus `crucible_match_players`. `crucible_encounters` is a query-optimized index that can be rebuilt from those tables.

The import flow is:

```text
login/dashboard request
  -> enqueue or mark sync requested
  -> authenticated cron claims a user
  -> load all Destiny character IDs
  -> fetch paginated AllPvP activity history per character
  -> fetch/cache each PGCR
  -> parse normalized PvP PGCR
  -> classify mode
  -> upsert match and players
  -> insert viewer-to-opponent encounter rows
  -> save cursor/progress
  -> dashboard batch-loads summaries for visible opponents
```

## Phase 1: Add the Database Schema

Create the next numbered migration after the current highest migration. At the time this guide was written, the highest migration was `048_grant_invict_to_founders.sql`, so use `049_crucible_head_to_head.sql` unless another migration has been added first.

Use this logical schema. Match the repository's existing SQL formatting and timestamp conventions.

### `crucible_matches`

Required columns:

```sql
instance_id text primary key
activity_hash bigint
activity_mode integer
activity_modes integer[] not null default '{}'
mode_bucket text not null
activity_name text
period timestamptz not null
duration_seconds integer
is_private boolean not null default false
team_data jsonb not null default '[]'::jsonb
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Add a check constraint for `mode_bucket`:

```text
trials, competitive, control, iron_banner, other
```

Add indexes on `(period desc)`, `(mode_bucket, period desc)`, and `activity_hash`.

Do not cascade-delete `pgcr_cache`. A match may optionally reference `pgcr_cache(instance_id)`, but the reference is not required. The instance ID itself is sufficient.

### `crucible_match_players`

Required columns:

```sql
instance_id text not null references crucible_matches(instance_id) on delete cascade
membership_id text not null
membership_type integer
display_name text not null
team_id integer
is_win boolean
completed boolean
kills integer
deaths integer
assists integer
score integer
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
primary key (instance_id, membership_id)
```

Add indexes on `(membership_id, instance_id)` and `(membership_id, team_id)`.

### `crucible_encounters`

Required columns:

```sql
viewer_user_id text not null references users(id) on delete cascade
viewer_membership_id text not null
opponent_membership_id text not null
opponent_membership_type integer
opponent_display_name text not null
instance_id text not null references crucible_matches(instance_id) on delete cascade
mode_bucket text not null
viewer_won boolean
played_at timestamptz not null
created_at timestamptz not null default now()
primary key (viewer_user_id, opponent_membership_id, instance_id)
```

Add indexes on:

```sql
(viewer_user_id, opponent_membership_id, played_at desc)
(viewer_user_id, mode_bucket, played_at desc)
(viewer_user_id, played_at desc)
```

The primary key is what prevents double-counting.

### `crucible_sync_state`

Required columns:

```sql
user_id text primary key references users(id) on delete cascade
status text not null default 'queued'
next_page integer not null default 0
character_ids jsonb not null default '[]'::jsonb
active_character_index integer not null default 0
last_incremental_sync_at timestamptz
backfill_completed_at timestamptz
locked_by text
locked_until timestamptz
last_error text
attempts integer not null default 0
requested_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Allowed statuses:

```text
queued, syncing, complete, failed
```

Add an index on `(status, requested_at)` and another on `locked_until`.

Enable RLS on all four tables. Do not add anonymous/browser write policies. Server code must access these tables through `adminSupabase`. This matches the security posture of `pgcr_cache` and worker infrastructure.

Add an atomic SQL function named `claim_crucible_sync(p_worker_id text, p_lock_seconds integer default 55)`. It must select the oldest queued item, or a syncing item whose lock expired, using `for update skip locked`; set `status = 'syncing'`, set the lock fields, increment attempts, and return the row. This prevents two cron invocations from syncing the same user simultaneously.

### Phase 1 verification

- Apply the migration locally or to the development Supabase project.
- Confirm all tables, constraints, indexes, RLS settings, and the claim function exist.
- Run the migration twice and verify it is idempotent where practical.
- Do not continue if duplicate encounter rows can be inserted for the same viewer, opponent, and match.

## Phase 2: Add Crucible Types and Mode Classification

Create `lib/crucible/types.ts` containing:

```ts
export type CrucibleModeBucket =
  | "trials"
  | "competitive"
  | "control"
  | "iron_banner"
  | "other";

export interface HeadToHeadSummary {
  opponentMembershipId: string;
  opponentMembershipType: number | null;
  opponentDisplayName: string;
  encounters: number;
  wins: number;
  losses: number;
  unknown: number;
  lastPlayedAt: string | null;
}
```

Add match-detail and sync-state interfaces as needed. Avoid `any` in new code.

Create `lib/crucible/modes.ts` with a pure function:

```ts
classifyCrucibleMode(input: {
  activityMode: number | null;
  activityModes: number[];
  activityHash: number | null;
  activityName?: string | null;
}): CrucibleModeBucket
```

Classification priority must be:

1. Trials
2. Iron Banner
3. Competitive
4. Control
5. Other

Use Bungie's official `DestinyActivityModeType` values. Before hard-coding values, verify them against the Bungie API/OpenAPI definition available at implementation time. Store constants with names, not unexplained integers. Preserve the raw `activityMode`, `activityModes`, and `activityHash` in the database so classification can be corrected later without refetching PGCRs.

Do not identify Competitive solely by checking whether the activity name contains `competitive`. Use official mode values or a maintained activity-hash mapping. Activity-name matching may only be a final fallback and must have tests.

Create `__tests__/lib/crucible/modes.test.ts`. Cover at least:

- Trials wins over other overlapping mode values.
- Iron Banner classification.
- Competitive Survival/Countdown/other currently active comp modes.
- Control classification.
- An unknown PvP mode returns `other`.
- Missing mode values do not throw.

### Phase 2 verification

Run:

```bash
npm test -- __tests__/lib/crucible/modes.test.ts
npx eslint lib/crucible/types.ts lib/crucible/modes.ts __tests__/lib/crucible/modes.test.ts
npx tsc --noEmit
```

## Phase 3: Build an Idempotent Match Importer

Create `lib/crucible/importMatch.ts`.

Export a function with dependency injection so it can be unit tested:

```ts
importCrucibleMatch(input: {
  viewerUserId: string;
  viewerMembershipId: string;
  rawPgcr: unknown;
  activityName?: string | null;
  db?: typeof adminSupabase;
}): Promise<{ imported: boolean; encounterCount: number }>
```

Required behavior:

1. Call the existing `parsePgcr(rawPgcr)`.
2. Return `{ imported: false, encounterCount: 0 }` if the parsed result is unsupported or not PvP.
3. Find the viewer in `pgcr.players`. Return without creating encounters if the viewer is missing.
4. Resolve the viewer's team from the viewer player row.
5. Treat players on a different non-null team as opponents.
6. If team data is missing, do not guess. Import the match/player rows but create zero encounters and log a warning.
7. Determine `viewer_won` from the viewer's own `isWin`. Keep `null` if unknown.
8. Read `is_private` from the raw PGCR. Private matches may be stored, but decide whether they appear in the default UI using an explicit query filter. Default recommendation: exclude private matches from counters and add them later behind a `Private` filter.
9. Upsert `crucible_matches` by `instance_id`.
10. Upsert every normalized player into `crucible_match_players` by `(instance_id, membership_id)`.
11. Upsert one `crucible_encounters` row for each opponent by `(viewer_user_id, opponent_membership_id, instance_id)`.
12. Never increment numeric counters during import. Summaries are calculated from encounter rows, which makes re-imports safe.

Use the PGCR period as `played_at`. Do not use import time.

Display names are snapshots and may change. The newest encounter should provide the current displayed opponent name in summary queries.

Create `__tests__/lib/crucible/importMatch.test.ts`. Include fixtures for:

- A normal 3v3 match creates three opponent encounters.
- A normal 6v6 match creates six opponent encounters.
- Teammates are not inserted as opponents.
- Re-importing the same PGCR produces no duplicates.
- Viewer win, loss, and unknown results are preserved.
- Missing viewer creates no encounter rows.
- Missing team IDs creates no encounter rows.
- PvE and unsupported PGCRs are ignored.
- A player who quit early remains an opponent if the PGCR includes them.
- A private match follows the chosen policy.

### Phase 3 verification

Run the focused tests, lint touched files, and run TypeScript. Do not continue until duplicate imports are proven safe.

## Phase 4: Build Bungie History Synchronization

Create `lib/crucible/historyClient.ts`. Do not modify the challenge-run detector to perform this backfill.

Add these server-only functions:

```ts
getDestinyCharacterIds(membershipType, membershipId, accessToken)
getCrucibleActivityPage(membershipType, membershipId, characterId, page, accessToken)
```

Use Bungie's profile endpoint with the Characters component to discover every character. Do not rely only on `lobby_members.selected_character_id`, because all characters must be searched and the user might not currently be in a lobby.

Use the character activity-history endpoint with:

- the official AllPvP mode,
- an explicit page number,
- the largest supported count that remains within Bungie's documented limit,
- the user's OAuth token from `getBungieToken`.

Do not fetch all pages in one request or one cron invocation. Bungie rate limits and serverless time limits make that unsafe.

Create `lib/crucible/sync.ts` with:

```ts
syncNextCrucibleHistoryPage(userId: string): Promise<{
  processedActivities: number;
  importedMatches: number;
  hasMore: boolean;
}>
```

Algorithm:

1. Load the user's `bungie_accounts` row for membership ID/type.
2. Obtain a valid access token with `getBungieToken`.
3. If the sync state has no character IDs, fetch and save all character IDs.
4. Fetch exactly one history page for the active character and saved page number.
5. Deduplicate activity instance IDs within the page.
6. For each activity, check whether the viewer-specific encounter import is already complete. Even when `pgcr_cache` contains the PGCR, the viewer may not yet have encounter rows.
7. Fetch the immutable PGCR through the existing cached `getPGCR(instanceId)` function.
8. Call `importCrucibleMatch`.
9. Limit PGCR work per invocation. Start with 20 activities or stop before the route's execution deadline.
10. Save the next page cursor.
11. When a character returns no activities, advance to the next character and reset page to zero.
12. When every character is exhausted, set `backfill_completed_at` and `status = 'complete'`.
13. On later incremental syncs, start at page zero for every character and stop when reaching an already-seen instance older than `last_incremental_sync_at`.
14. On errors, save a short sanitized `last_error`; never save tokens or full Bungie responses there.

Because the same match can appear in activity history for multiple characters, rely on primary keys and upserts. Do not assume each instance ID appears only once.

### Queueing sync work

Create `lib/crucible/queueSync.ts` with an idempotent `queueCrucibleSync(userId)` function. It should upsert `crucible_sync_state`, set `requested_at = now()`, and queue completed users for an incremental sync only when their last sync is stale. Use a six-hour freshness window initially.

Create `POST /api/crucible/sync/route.ts`:

- Require a signed-in session.
- Queue only the current user.
- Return the current sync status.
- Do not perform the full sync inside the request.

Create `GET /api/cron/sync-crucible/route.ts`:

- Protect it with `assertCronAuth`.
- Use `claim_crucible_sync`.
- Process users until close to the route deadline, with a conservative maximum such as five users/pages per invocation.
- Clear locks after success.
- Requeue unfinished backfills.
- Use bounded retries and mark repeated failures `failed`.
- Set `export const maxDuration = 60` to match existing cron conventions.

Add the new cron endpoint to the same external scheduler or GitHub Actions workflow currently invoking the existing cron routes. Do not assume `vercel.json` schedules it; this repository currently uses external scheduling for frequent jobs.

Queue a sync after successful Bungie login and when the dashboard loads if the user's data is stale. Dashboard queueing must be fire-and-forget from the UI and must not delay page rendering.

### Phase 4 tests

Add tests for:

- all characters are discovered,
- one page is processed per unit of work,
- page and character cursors advance correctly,
- a repeated activity is harmless,
- an existing cached PGCR is reused,
- incremental sync stops at known history,
- expired tokens use existing refresh behavior,
- private profiles fail gracefully,
- stale syncs are queued but fresh syncs are not,
- two cron workers cannot claim the same user.

Mock Bungie fetches. Unit tests must not call the live Bungie API.

## Phase 5: Add Head-to-Head Queries and API Routes

Create `lib/crucible/headToHead.ts` with pure presentation helpers and server-side database queries.

Required functions:

```ts
getHeadToHeadSummary(input: {
  viewerUserId: string;
  opponentMembershipId: string;
  mode?: CrucibleModeBucket | "all";
}): Promise<HeadToHeadSummary>

getHeadToHeadSummaries(input: {
  viewerUserId: string;
  opponentMembershipIds: string[];
  mode?: CrucibleModeBucket | "all";
}): Promise<Record<string, HeadToHeadSummary>>

getHeadToHeadMatches(input: {
  viewerUserId: string;
  opponentMembershipId: string;
  mode?: CrucibleModeBucket | "all";
  cursor?: string;
  limit?: number;
}): Promise<{ matches: HeadToHeadMatch[]; nextCursor: string | null }>

getCrucibleMatchHistory(input: {
  viewerUserId: string;
  cursor?: string;
  limit?: number;
}): Promise<{ matches: SeasonMatch[]; nextCursor: string | null }>
```

Summary calculations:

```text
encounters = total encounter rows
wins       = viewer_won is true
losses     = viewer_won is false
unknown    = viewer_won is null
```

Use a single grouped query or a Supabase RPC for batch summaries. Do not issue one database query per visible opponent. The season panel can show up to six opponents per match and many matches per page; N+1 queries are unacceptable.

The detail query should join `crucible_encounters`, `crucible_matches`, and both relevant `crucible_match_players` rows. Return date, activity name, mode bucket, result, viewer stats, opponent stats, and instance ID. Use cursor pagination ordered by `(played_at desc, instance_id desc)`.

`getCrucibleMatchHistory` must make imported Crucible matches, rather than `challenge_runs`, the source of truth for the dashboard's historical PvP reports. Query matches containing the viewing user's Destiny membership ID, split players using the viewer's team ID, and present both rosters using the existing `SeasonMatch` shape or a deliberately extended replacement type. If an imported match's `instance_id` also appears as `challenge_runs.pgcr_instance_id`, enrich it with the Rerolled challenge title and rolled loadout. Do not duplicate the match. Non-Crucible challenge history may remain on its existing path.

Update `lib/stats/season.ts` so its aggregate season tiles continue using `player_season_stats`, while its PvP `matchHistory` comes from `getCrucibleMatchHistory`. Keep pagination bounded; do not load a user's entire imported career into the dashboard server render.

Create API routes:

```text
GET /api/crucible/head-to-head?opponents=id1,id2&mode=all
GET /api/crucible/head-to-head/[membershipId]?mode=all&cursor=...
GET /api/crucible/matches?cursor=...
```

Validate all input with Zod. Require a session and derive `viewerUserId` from it. Never accept viewer identity from the browser.

Limit the batch endpoint to 50 opponent IDs, deduplicate them, and reject malformed IDs. Return empty summaries rather than 404 for opponents with no recorded encounters.

### Phase 5 tests

Test:

- all-mode totals,
- per-mode totals,
- unknown outcomes,
- newest display name wins,
- no rows returns zero counts,
- batch lookup uses one data-layer operation,
- users cannot query as another viewer,
- pagination is stable when two games share a timestamp.
- imported all-Crucible history is returned even when no `challenge_run` exists,
- a match linked to a challenge run is enriched rather than duplicated.

## Phase 6: Add the Dashboard UI

Do not replace the external Trials Report links. Head-to-head is an additional Rerolled feature.

Update `types/platform.ts` or use the new Crucible types to add an optional head-to-head summary to displayed opponent rows. Keep the existing match history types backward compatible.

Create:

```text
components/crucible/HeadToHeadChip.tsx
components/crucible/HeadToHeadPopover.tsx
components/crucible/HeadToHeadDetails.tsx
hooks/useHeadToHead.ts
```

Recommended interaction in `SeasonPanel`:

- The historical report list shows imported Crucible matches whether or not a Rerolled challenge was active.
- Each enemy roster row gets a small `H2H 4-2` chip when recorded encounters exist.
- If there are no encounters beyond the currently displayed game, show `H2H 1-0` or `H2H 0-1`; do not hide valid single-game data.
- Hover or focus opens a compact popover.
- Clicking opens a details panel or modal with mode filters and paginated games.
- Keep the external-arrow link to Trials Report as a separate click target.

Popover content:

```text
HEAD TO HEAD
Recorded encounters: 7
Your record: 4-3
Last played: Jul 8
[All] [Trials] [Comp] [Control] [Iron Banner]
View games
```

Accessibility requirements:

- The trigger must be a real button.
- Keyboard focus must open the same content as hover.
- Escape closes the popover/modal.
- Do not place a button inside the existing Trials Report anchor. Refactor the roster row so the player name link and H2H button are siblings.
- Include an accessible label such as `Head-to-head record against {displayName}`.
- Loading, empty, failed, and partial-sync states must be distinct.

Partial-sync copy:

```text
Importing Crucible history. This record may increase as older games are processed.
```

Complete-state disclaimer:

```text
Based on recorded Bungie activity history.
```

Use the existing dashboard visual language: sharp borders, compact uppercase labels, Bungie blue accents, monospace numbers, and no rounded generic cards.

The hook must batch visible opponent IDs into one request. Cache results by `viewer + mode + sorted opponent IDs`, and avoid refetching on every hover. Do not add a client request for each roster row.

### Phase 6 tests

Add component tests for:

- chip renders the correct viewer-perspective record,
- zero and unknown states,
- hover and keyboard focus,
- Trials Report link still works independently,
- mode filter changes the displayed summary,
- loading and partial-backfill messaging,
- batch request deduplicates opponent IDs,
- modal pagination appends without duplicating matches.

Test mobile layout manually. The H2H chip must not force roster names or K/D values off-screen.

## Phase 7: Backfill, Observability, and Operations

Do not queue every existing user simultaneously in the migration. That can create a Bungie API spike.

Add a protected script or admin-only route that queues existing users in controlled batches. Suggested behavior:

- queue 25 users at a time,
- oldest/never-synced first,
- print queued, skipped, and failed counts,
- support dry-run,
- never print OAuth tokens.

Add structured logs for:

- user sync claimed,
- character/page processed,
- activities scanned,
- PGCR cache hits/misses,
- matches imported,
- encounter rows inserted,
- rate-limit response,
- auth/private-profile failure,
- sync completion.

Do not log raw PGCRs or tokens.

Track these operational metrics if the existing logging provider supports them:

- queued sync users,
- failed sync users,
- average page duration,
- PGCRs imported per cron run,
- Bungie 429 responses,
- users with completed backfills.

When Bungie returns a rate limit, respect `Retry-After` if present, release the lock safely, and schedule the next attempt after that delay. Do not immediately retry in a loop.

## Phase 8: End-to-End Verification

Run the full local verification suite:

```bash
npm test
npx eslint app components hooks lib types __tests__
npx tsc --noEmit
npm run build
```

Then verify manually with a development account:

1. Sign in with Bungie.
2. Queue a Crucible sync.
3. Invoke the protected sync cron.
4. Confirm sync state advances by page and character.
5. Confirm the same PGCR imported twice creates one match and one viewer/opponent encounter.
6. Confirm teammates never appear in head-to-head results.
7. Confirm Trials, Competitive, Control, Iron Banner, and Other filters produce sensible matches.
8. Confirm the dashboard displays H2H records for opponents in historical reports.
9. Confirm records are from the viewing user's perspective.
10. Confirm the external Trials Report player link still opens correctly.
11. Confirm keyboard and mobile behavior.
12. Confirm a private Bungie profile receives a useful non-destructive error state.

Before production deployment, inspect a sample of at least ten real PGCRs across 3v3, 6v6, Trials, Competitive, Control, Iron Banner, a quitter, and a private match. Compare teams and outcomes against Bungie's displayed post-game result.

## Deployment Order

Deploy in this order:

1. Database migration.
2. Importer, sync service, query layer, and cron route with the UI still hidden.
3. Run a small internal backfill and inspect data quality.
4. Deploy the UI behind an environment flag such as `NEXT_PUBLIC_CRUCIBLE_H2H_ENABLED`.
5. Enable it for internal users.
6. Monitor rate limits and incorrect classifications.
7. Enable it for everyone.
8. Queue remaining historical users gradually.

Every production write must be backward compatible with the currently deployed app. Do not deploy UI code before its tables and API routes exist.

## Explicit Non-Goals for Version 1

Do not add these during the first implementation:

- lifetime kill/death totals against a specific opponent unless the product explicitly asks for them,
- per-round Trials results, because Bungie PGCRs do not provide reliable round-by-round player events,
- Elo or skill-rating calculations,
- global opponent search,
- automatic ingestion for Destiny players who have never authenticated with Rerolled,
- claims that the record is complete for all time,
- live in-match opponent scouting.

These can be added after ingestion accuracy and API cost are proven.

## Definition of Done

The feature is done only when all of the following are true:

- Normal Crucible matches import independently of Rerolled challenge runs.
- Every import is idempotent.
- Head-to-head counts include opponents and exclude teammates.
- Counts can be filtered by the required mode buckets.
- All characters are included in backfill.
- Backfill is paginated, resumable, rate-limit aware, and safe under concurrent cron calls.
- Dashboard opponent rows batch-load summaries without N+1 requests.
- Dashboard historical PvP reports include imported non-Rerolled matches.
- Users can inspect the individual matches behind a counter.
- Partial-history language is visible and honest.
- Trials Report links remain available.
- Focused tests, full tests, lint, TypeScript, and production build pass.
- A sample of real PGCRs has been manually compared with Bungie results.

## Prompt to Give the Implementing Model

Use the following prompt together with this document:

```text
Implement the Crucible head-to-head feature exactly as described in
docs/crucible-head-to-head-implementation.md.

Work phase by phase and do not skip verification gates. First inspect every
existing file named in "Existing Code to Reuse" and check git status. Preserve
unrelated user changes. Use apply_patch for manual file edits.

Important rules:
- Do not build the UI until schema, importer, sync, and query tests pass.
- Never count by incrementing a total during PGCR import; derive summaries from
  uniquely keyed encounter rows.
- Never count teammates as opponents.
- Never fetch one API request per roster row; batch opponent summaries.
- Never expose Bungie OAuth tokens or service-role database access to clients.
- Do not guess unknown teams, outcomes, or activity modes.
- Do not claim imported history is complete for all time.
- Do not modify or break the existing challenge-run PGCR worker.
- Do not push, deploy, or run production migrations unless explicitly asked.

After each phase, run the focused tests, lint changed files, and run
`npx tsc --noEmit`. At the end run the complete test suite and production build.
Report changed files, migration requirements, verification results, remaining
risks, and whether production backfill has been run.
```

## Known Risks the Implementer Must Not Ignore

- Bungie activity-history availability may not cover a player's full lifetime.
- Private profiles can prevent history access.
- Activity mode values and playlist composition can change; raw modes and hashes must be retained.
- The existing PGCR cache may contain raw reports without normalized reports, so the importer must be able to parse cached raw data.
- One match can appear in multiple character histories.
- Display names can change, while membership IDs are the stable identity.
- Serverless execution time and Bungie rate limits require bounded, resumable work.
- Rumble and other free-for-all modes do not have normal opposing teams. Version 1 should classify them as `other` and skip encounter generation unless a separately tested free-for-all policy is added.
- Cross-save identities must use the Destiny membership ID/type returned in PGCRs, not a display name.
