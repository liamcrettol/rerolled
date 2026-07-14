# Slim Rerolled to its core + split Crucible H2H into its own site

Status: IN PROGRESS (audit 2026-07-14; dormant-artifact cleanup shipped
2026-07-14: the Score Attack / Weekly worker substrate, badge award pipeline,
process-jobs cron, weekly authoring CLI, and stale preview harnesses were
deleted, and migration 059 dropped their 10 dead tables + 6 DB functions and
unscheduled ping-process-jobs. Survivors that live features still use:
lib/scoreAttack/{pgcr,types,activityPool}.ts, lib/challenges/present.ts,
weekly_challenges + weekly_challenge_versions tables, challenge_runs family,
player_season/lifetime_stats. That pre-completes most of Phase 4; what remains
of Phase 4 is endgame removal plus those survivors, which die with the season
panel in Phase 2/5.)

Goal, per Josh: Rerolled keeps **PvP Loadout Roulette** and **Draft** only. Everything
else (leaderboards, badges, season stats, score attack substrate, endgame roulette)
gets removed. The **Crucible match history + head-to-head** system becomes its own
site, the way Trials Report and Crucible Report are separate products that link to
each other.

---

## Part 1: Architecture audit (what the site is today)

### Feature inventory

| # | Feature | Lives in | Verdict |
|---|---------|----------|---------|
| 1 | PvP Loadout Roulette (lobby, roll, apply, match detection, in-lobby stats) | `app/lobby`, `app/join`, `app/watch`, `app/api/lobby/*`, `app/api/roulette/*`, `app/api/apply`, `app/api/stats/{detect,collect,history}`, `lib/roulette`, `lib/lobby`, `lib/stats/record.ts`, `lib/bungie/*`, `components/LobbyRoom.tsx` + lobby components | **KEEP** |
| 2 | Draft | `app/draft`, `app/api/draft/*`, `lib/draft`, `components/DraftBoard.tsx` | **KEEP** |
| 3 | Endgame Roulette (PvE raid/dungeon/GM randomizer) | `app/endgame`, `app/api/endgame/*`, `lib/endgame`, `components/endgame/*`, lobby `mode: "endgame"` | **REMOVE** (pending confirmation, see Decisions) |
| 4 | Badges | `lib/badges`, `components/badges/*`, `app/badges`, `badges` + `player_badges` tables; props threaded through `PlayerCard`, `TopNav`, `RollDetails`, `LobbyRoom`, lobby + draft + stats pages | **REMOVE** |
| 5 | Leaderboards | `app/leaderboards`, `components/Leaderboard.tsx`, `components/WeaponHallOfFame.tsx`, `app/api/stats/leaderboard`, `season_leaderboard_entries`, `weekly_leaderboard_entries` | **REMOVE** |
| 6 | Score Attack / Challenges / Weekly substrate (already UI-removed in #342, code dormant) | `lib/scoreAttack`, `lib/challenges`, `lib/weekly`, `app/api/cron/process-jobs`, `worker_jobs`, `challenge_*`, `run_*`, `weekly_*`, `seasons`, `player_season_stats`, `player_weekly_stats`, `player_lifetime_stats` | **REMOVE** (except `parsePgcr`, which moves with H2H) |
| 7 | Crucible history + head-to-head | `lib/crucible`, `app/api/crucible/*`, `app/api/cron/{sync,backfill,reclassify}-crucible`, `app/api/internal/repair-crucible`, `components/CrucibleHistorySync.tsx`, `components/crucible/*`, `components/platform/SeasonPanel.tsx` (match reports), `lib/pgcr` (Appwrite archive), `crucible_*` tables, Appwrite storage | **SPLIT to new site** |
| 8 | Stats pages (`/stats`, `/stats/[userId]`, dashboard "Your Season" panel) | `app/stats`, `components/DashboardStats.tsx`, `lib/stats/season.ts`, `lib/stats/history.ts` | **REMOVE** here; match-report UI moves to the new site |
| 9 | Platform chrome (dashboard, TopNav, ModeGrid, HeroReel, landing) | `app/dashboard`, `app/page.tsx`, `components/platform/*` | **KEEP, slimmed** (nav loses Leaderboards/Stats; dashboard loses SeasonPanel) |

### The tangles (why this is not just deleting folders)

1. **`lib/scoreAttack/pgcr.ts` (`parsePgcr`) is the PGCR parser the H2H importer
   uses** (`lib/crucible/importMatch.ts`, `lib/crucible/sync.ts`). It must move
   with the H2H site. Don't delete `lib/scoreAttack` until the new site has its
   copy.
2. **`lib/stats/season.ts` imports challenges + scoreAttack + crucible** and feeds
   the dashboard SeasonPanel. It dies when both #6 and #7 go, so the dashboard
   right column must be replaced, not just trimmed.
3. **Badges are threaded through core components as props**: `PlayerCard`,
   `TopNav`, `PlatformShell`, `RollDetails`, `LobbyRoom`, and the lobby/draft/stats
   pages all import from `lib/badges`. Removal is a prop-strip across ~10 files,
   not a folder delete.
4. **`app/api/auth/bungie/callback` queues a Crucible sync on every login**
   (`queueCrucibleSync`). Remove the hook when H2H leaves.
5. **`lib/endgame/randomizer.ts` imports `lib/scoreAttack` (activity pool)**, so
   endgame must be removed (or rewired) before/with the scoreAttack deletion.
6. **`pgcr_cache` is shared**: core roulette match detection (`lib/stats/record.ts`
   via `lib/bungie/pgcr.ts`) and the H2H importer both read/write it through
   `lib/pgcr/service.ts` (Appwrite archive, migration 058). After the split,
   Rerolled keeps a plain `pgcr_cache` (re-enable pruning, cf. migrations 052/057)
   and the Appwrite archive moves to the H2H site, which owns durable history.
7. **Scheduling is in two places**: Supabase `pg_cron` (migration 056: pings
   `sync-crucible` every 10 min, `process-jobs` every 15 min, plus the core
   `cleanup-lobbies` and `detect-games`) AND GitHub Actions workflows
   (`sync-crucible.yml`, `process-jobs.yml`, `backfill-crucible-results.yml`,
   `reclassify-crucible.yml`). Both must be cleaned up or the deleted routes get
   pinged into 404s forever.

### In-lobby stats are NOT the bloat (don't over-delete)

The roulette lobby's own loop depends on: `game_sessions`, `player_game_stats`,
`weapon_round_kills`, `roll_history`, `pgcr_cache`, `/api/stats/detect`,
`/api/stats/collect`, `/api/stats/history` (only `LobbyRoom.tsx` calls these), and
the `detect-games` + `cleanup-lobbies` crons. Captain rotation is triggered by
match detection. All of that stays.

### Database: keep vs drop (45 tables today)

**Keep (16):** `users`, `bungie_accounts`, `oauth_states`, `auth_codes`,
`cached_manifest_metadata`, `lobbies`, `lobby_members`, `lobby_rounds`,
`lobby_pools`, `lobby_loadout_slots`, `lobby_draft_options`, `lobby_draft_votes`,
`roll_history`, `game_sessions`, `player_game_stats`, `weapon_round_kills`.

**Move to the H2H site's DB (5):** `crucible_matches`, `crucible_match_players`,
`crucible_match_viewers`, `crucible_encounters`, `crucible_sync_state` (plus a
copy of `pgcr_cache` as its seed corpus, plus the Appwrite raw-PGCR archive).

**Drop (~24):** `badges`, `player_badges`, `challenge_runs`,
`challenge_run_events`, `challenge_run_participants`,
`challenge_run_loadout_slots`, `run_compliance_results`,
`run_equipment_snapshots`, `run_legality_results`, `run_processing_events`,
`run_trials_passage_snapshots`, `seasons`, `player_season_stats`,
`player_weekly_stats`, `player_lifetime_stats`, `season_leaderboard_entries`,
`weekly_challenges`, `weekly_challenge_versions`, `weekly_leaderboard_entries`,
`worker_jobs`, `draft_sessions` + `draft_picks` (dead, zero code references; the
live draft uses `lobby_draft_*`), and `lobby_endgame_rounds` +
`lobby_endgame_exotic_picks` if endgame goes.

Before each drop, grep the table name across `app lib components scripts` and
confirm zero hits. Export a `pg_dump` of everything first, so nothing is
unrecoverable.

---

## Part 2: Decisions needed before starting

1. **Endgame Roulette: remove or keep?** Josh's list was "PvP roulette, draft and
   that's it," which excludes it. Recommendation: **remove** (it's PvE, off-thesis,
   and depends on scoreAttack code we're deleting). Cheap to resurrect later from
   git history if wanted.
2. **New site identity.** Recommendation: start on a subdomain,
   **`h2h.d2roulette.app`** (free and instant, domain is on Vercel nameservers;
   a standalone domain can be added later without code changes). Plain, direct
   name for the product itself (e.g. "Rerolled H2H" or "Crucible History"), no
   puns.
3. **Database strategy.** Recommendation: **new, separate Supabase project** owned
   by the H2H site. H2H is the data-heavy side (pgcr_cache was ~74 MB at 5.3k
   matches; crucible tables grow unbounded; the current free-tier project caps at
   500 MB). Splitting isolates that growth from the lobby DB and makes "separate
   products" real. The only cross-DB need is identity, and Bungie membership ID
   covers that without any shared tables.
4. **Move data or re-backfill?** Recommendation: **move it** (`pg_dump` the
   `crucible_*` tables + `pgcr_cache` into the new project). Bungie's activity
   history availability is not guaranteed forever; imported data is an asset. The
   Appwrite raw-PGCR archive already exists as the durable copy and just gets
   repointed to the new site.
5. **Repo strategy.** Recommendation: **separate repo** (`rerolled-h2h` or
   similar), copy the ~15 files it needs (Bungie client/auth, crucible lib,
   parsePgcr, pgcr service, design tokens). No monorepo/shared-package machinery
   for two small sites; that's the Trials Report / Crucible Report model. Accept
   that the Bungie client code forks.
6. **Auth on the new site.** It needs its own Bungie OAuth app (Bungie allows one
   redirect URL per app), its own `users`/`bungie_accounts`/token encryption.
   Users sign in on each site separately, exactly like Trials Report vs Crucible
   Report. Add a preview Bungie app too if the new site keeps the staging-first
   model.

---

## Part 3: Step-by-step execution plan

Work each phase as one GitHub issue, one squashed commit to `main` (staging),
verify on `preview.d2roulette.app`, then promote. Phases 1, 2, and 4 are
independent deletions in Rerolled; Phase 3 is the new site and can proceed in
parallel. Phase 5 (deleting crucible from Rerolled) must wait for Phase 3.

After every phase: `npm test`, `npx tsc --noEmit`, `npm run build`, plus a grep
for imports of the deleted modules (`@/lib/badges`, `@/lib/crucible`, etc.) to
catch dangling references.

### Phase 0: Freeze and file the decisions

- Get sign-off on the 6 decisions above (especially endgame).
- `pg_dump` the full database as a safety snapshot before any drops.
- File one tracking issue per phase below.

### Phase 1: Remove badges (Rerolled)

- Delete `lib/badges/`, `components/badges/`, `app/badges/`.
- Strip badge props/imports from: `components/PlayerCard.tsx`,
  `components/platform/TopNav.tsx`, `components/platform/PlatformShell.tsx`,
  `components/RollDetails.tsx`, `components/LobbyRoom.tsx`,
  `app/lobby/[code]/page.tsx`, `app/draft/[code]/page.tsx` (stats page dies in
  Phase 2 anyway).
- Delete badge tests under `__tests__/`.
- DB (after code ships): drop `badges`, `player_badges`; note that badge-related
  migrations 030/036-039/043-051 stay in the repo as history, per the repo's
  append-only migration convention. Write one new `0XX_drop_badges.sql`.

### Phase 2: Remove leaderboards, stats pages, and slim the chrome (Rerolled)

- Delete `app/leaderboards/`, `app/stats/`, `components/Leaderboard.tsx`,
  `components/WeaponHallOfFame.tsx`, `components/DashboardStats.tsx`,
  `app/api/stats/leaderboard/`.
- `components/platform/TopNav.tsx`: LINKS becomes just PLAY (or PLAY + an
  external link to the H2H site once it exists).
- Dashboard (`app/dashboard/page.tsx`): remove `SeasonPanel`,
  `getSeasonStats`, `DashboardLiveRefresh` (verify it's season-only first).
  Layout becomes the ModeGrid front-and-center; reserve a slot for a "Match
  History / H2H" card that will deep-link to the new site.
- Keep `/api/stats/{detect,collect,history}` and the in-lobby stats panel: those
  are the roulette loop, not the leaderboard layer.

### Phase 3: Stand up the H2H site (new repo, parallel track)

Scaffold: Next.js 15 App Router + TypeScript + Tailwind with the same design
tokens (copy `globals.css` bungie.* tokens + `.panel`/`.section-label`
utilities), new Supabase project, new Bungie OAuth app(s), new Vercel project on
`h2h.d2roulette.app`.

Port from Rerolled (mostly copy, then adapt imports):

- **Auth:** the Bungie OAuth provider/NextAuth setup, `lib/auth/*` (helpers,
  encrypt, cron), `users` + `bungie_accounts` + `oauth_states` schema. New
  `TOKEN_ENCRYPTION_KEY` (users re-authenticate on the new site; do NOT copy
  token rows, they're encrypted with Rerolled's key and refresh-bound to
  Rerolled's Bungie app).
- **Bungie client:** `lib/bungie/client.ts`, `lib/bungie/pgcr.ts` (PGCR fetch +
  activity history + `resolveActivity`), the manifest-lite pieces it needs.
- **Parser:** `lib/scoreAttack/pgcr.ts` + `lib/scoreAttack/types.ts`, renamed to
  `lib/pgcr/parse.ts` + types. Note issues #277/#278: the parser still rejects
  some PvP shapes; those issues transfer to the new repo.
- **H2H core:** all of `lib/crucible/`, `lib/pgcr/` (Appwrite archive + service),
  `app/api/crucible/*`, `app/api/cron/sync-crucible`, the repair/backfill/
  reclassify routes, `docs/crucible-head-to-head-implementation.md` and
  `docs/pgcr-archive.md`.
- **Schema:** migrations 049/050/051/054/055/058 consolidated into a clean
  initial migration set for the new DB (crucible_* + pgcr_cache +
  claim_crucible_sync RPC).
- **UI:** `components/platform/SeasonPanel.tsx` match reports,
  `components/crucible/HeadToHeadChip.tsx`, `components/CrucibleHistorySync.tsx`,
  `PlayerCard` (badge-free variant). The new site's homepage is essentially:
  sign in, see your match history, click opponents for H2H records. Player
  search / shareable profile pages become natural v2 features here.
- **Ops:** re-create the sync cron (Supabase pg_cron in the NEW project pinging
  the new domain, or a GitHub Actions workflow in the new repo), `CRON_SECRET`,
  Axiom logging if wanted, Appwrite project/env vars move here.

Data migration: `pg_dump --table 'crucible_*' --table pgcr_cache` from the old
project, restore into the new one. Do this at cutover time (Phase 5) so no sync
gap loses matches; the sync is idempotent, so overlap is harmless.

Definition of done: a Rerolled user can sign in on the new site, their history
syncs (recent top-up + background backfill), match reports render with H2H
chips, and the old imported history is present.

### Phase 4: Remove score attack / challenges / weekly / endgame (Rerolled)

Can start any time after Phase 0; endgame removal is bundled here because
`lib/endgame` imports `lib/scoreAttack`. Do NOT delete `lib/scoreAttack/pgcr.ts`
+ `types.ts` until Phase 3 has copied them (or just do this phase after Phase 3
starts; the copy takes minutes).

- Delete `lib/scoreAttack/`, `lib/challenges/`, `lib/weekly/`,
  `app/api/cron/process-jobs/`, `.github/workflows/process-jobs.yml`.
- Delete `app/endgame/`, `app/api/endgame/`, `lib/endgame/`,
  `components/endgame/*`; remove the `ironman` mode from `lib/modes/modes.ts`,
  `HOME_MODE_GRID`, and the landing page's `LANDING_MODES`; narrow `LobbyMode`
  to `"roulette" | "draft"` and clean `MODE_BASE_PATH`.
- `lib/stats/season.ts` and `lib/stats/history.ts` die here (their consumers
  went in Phase 2). `lib/stats/record.ts` STAYS.
- pg_cron: `select cron.unschedule('ping-process-jobs');` in the old project.
- DB drops (after code ships): the `challenge_*`, `run_*`, `weekly_*`, `seasons`,
  `player_season_stats`, `player_weekly_stats`, `player_lifetime_stats`,
  `season_leaderboard_entries`, `worker_jobs`, `draft_sessions`, `draft_picks`,
  and (if endgame confirmed) `lobby_endgame_*` tables.

### Phase 5: Cut Crucible H2H out of Rerolled (after Phase 3 ships)

- Run the data migration to the new DB (see Phase 3), verify row counts match.
- Delete `lib/crucible/`, `lib/pgcr/`, `app/api/crucible/*`,
  `app/api/cron/sync-crucible`, `app/api/cron/backfill-crucible-results`,
  `app/api/cron/reclassify-crucible`, `app/api/internal/repair-crucible`,
  `components/CrucibleHistorySync.tsx`, `components/crucible/`,
  `components/platform/SeasonPanel.tsx` (now lives in the new repo).
- Remove the `queueCrucibleSync` call from `app/api/auth/bungie/callback`.
- Revert `lib/bungie/pgcr.ts`'s cache path to a plain `pgcr_cache` read/write
  (drop the Appwrite service indirection); re-enable pgcr_cache pruning
  (migration 052 behavior) since Rerolled no longer owns durable history.
- Workflows: delete `sync-crucible.yml`, `backfill-crucible-results.yml`,
  `reclassify-crucible.yml`. pg_cron: unschedule `ping-sync-crucible`.
- Vercel env: remove Appwrite vars from the Rerolled project.
- DB drops: `crucible_*` tables (only after the new site verifies its copy).
- Docs: move the two H2H docs out, update CLAUDE.md (remove H2H/score-attack
  references, record the new site's existence and link policy).

### Phase 6: Connect the two sites

- Rerolled: dashboard card + post-match screen link out to
  `https://h2h.d2roulette.app/player/<membershipType>/<membershipId>` (same
  pattern as the existing external Trials Report links). No shared session
  needed; membership ID is the identity bridge.
- H2H site: header links back to `d2roulette.app` ("Play Roulette").
- Optional later: shared account linking, shared design package, cross-site
  "played with Rerolled loadout" annotations (H2H site could enrich match rows
  where an instance_id matches a Rerolled game_session).

### Phase 7: Final verification and promote

- Full suite in both repos: `npm test`, `npx tsc --noEmit`, `npm run build`.
- Manual pass on staging: create lobby, roll, apply, detect a match, captain
  rotates; run a draft end to end; sign in fresh on the H2H site and watch a
  backfill progress.
- Confirm no cron endpoint (pg_cron job or GitHub workflow) still points at a
  deleted route in either project.
- Promote Rerolled `main` → `release`; flip the H2H site's production domain.
- Watch Axiom/Vercel logs for 404s on removed routes for a week (stale clients,
  bookmarks), then delete the drop-table migrations' safety exports.

### Cleanup sweep (any time)

Lingering UI-preview harnesses that CLAUDE.md says should never have been
committed: `app/draft-edge-preview`, `app/draft-fix-preview`,
`app/draft-highlight-preview`, `app/draft-roll-preview`,
`app/draft-width-preview`, `app/match-card-preview`. Delete them (and
`.next/types` stragglers). `app/preview` (lobby mockup with seed button) is
bigger; confirm whether anyone uses it before deleting.

---

## What Rerolled looks like when this is done

- Pages: landing, dashboard (mode grid: Roulette + Draft), lobby, join, watch,
  draft, privacy.
- APIs: auth, lobby, roulette, apply, draft, stats/{detect,collect,history},
  bungie, cron/{detect-games,cleanup-lobbies}, version.
- Libs: auth, bungie, draft, lobby, roulette, stats/record, supabase, manifest,
  modes, destiny, api, logger, utils.
- DB: 16 tables.
- Crons: 2 (detect-games, cleanup-lobbies) + the weekly weapons-table refresh.
- Roughly 24 tables, ~6 lib trees, 3 page trees, 4 workflows, and 2 cron jobs
  lighter, with the H2H product free to grow its own data-heavy roadmap
  (player search, public profiles, deeper filters) without bloating the game
  night app.
