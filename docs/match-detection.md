# How match detection works

When a fireteam plays a game with their rolled loadout, the app detects the
finished game, pulls everyone's stats from the Bungie Post-Game Carnage Report
(PGCR), records them, rotates the captain, and opens the next round. This doc
explains how that pipeline fits together so you can change it safely.

## The flow

1. **Apply** (`app/api/apply/route.ts`) — the captain (or each member) equips the
   rolled loadout. This writes `roll_history.applied_at` and flips the lobby to
   `in_game`. When everyone has applied, the `mark_player_applied` RPC rotates
   the captain.
2. **Detect** — once `in_game`, every member's browser polls
   `POST /api/stats/detect` every 10s. Bungie takes a couple of minutes to
   publish the PGCR, so we poll until it appears.
3. **Record** — the first worker to find the PGCR writes the game and stats, then
   advances the round. Realtime pushes the new `game_sessions` row to everyone.
4. **Cron backstop** (`app/api/cron/detect-games/route.ts`) — runs every 5 min,
   catches any lobby that finished a game while nobody had the page open.

## Single recording pipeline

Both the detect route and the cron call **`lib/stats/record.ts → detectAndRecordGame()`**.
It is the ONLY place that:
- calls `collectPostMatchStats` (the PGCR scan/aggregation),
- inserts `game_sessions` + `player_game_stats` + `weapon_round_kills`,
- rotates the captain (unless already rotated this round, or captain is locked),
- advances to the next round.

> If you change what gets recorded, change it here — never inline it in a route.
> The two paths drifted apart once (the cron forgot `map_name`/`round_id`) and it
> silently broke map + weapon display for cron-recorded games.

## Three independent safety layers

Every fireteam member polls concurrently, so correctness can't depend on timing:

1. **Detection lease** (`claim_detection` RPC, migration 014) — a worker claims a
   ~20s TTL slot on the round before scanning Bungie. Only the claimer scans; the
   rest return `pending`. This stops N members from each hammering the Bungie PGCR
   API every cycle. The lease resets naturally each round (new round row defaults
   `detect_claimed_at` to null).
2. **Unique index** on `game_sessions(round_id)` (migration 013) — the final guard
   on the *write*. If two workers somehow both scan and try to insert (e.g. cron
   vs. a leased client), the second insert fails and `detectAndRecordGame` returns
   `already_recorded` with the existing stats instead of duplicating.
3. **Cron** — the backstop for when no browser is open. It skips the lease (it's
   single and infrequent) and leans on the unique index.

Any one layer failing doesn't corrupt data.

## What counts as a trackable game

In `lib/bungie/pgcr.ts → collectPostMatchStats`:
- Activity must have started **after** the loadout was applied (`appliedAt`, with a
  60s clock-skew buffer).
- **All** fireteam members must appear in the PGCR.
- Must be **PvP** — we require the `standing` (win/loss) field, which only PvP and
  private matches have. This excludes strikes/raids/dungeons.
- Private matches **are** tracked (we don't require a roulette-weapon kill, because
  Bungie sometimes omits `extended.weapons` from private-match PGCRs).

## Captain rotation — who rotates and when

Rotation must fire exactly once per round. It can happen on any of three paths,
each of which checks `lobby_rounds.captain_rotated` first so it never double-fires:
- **apply route** — when the last member applies (`mark_player_applied`).
- **detectAndRecordGame** — fallback, if the game ended before everyone applied.
- **cron** — fallback, if nobody had the page open.

`rotateCaptain` (`lib/lobby/index.ts`) advances by `joined_at` order with
wraparound. When the captain leaves mid-session, `app/api/lobby/leave/route.ts`
hands off to the next member in that same order (not just the oldest).
