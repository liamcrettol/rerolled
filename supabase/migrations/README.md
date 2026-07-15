# Database migrations

**Migrations are NOT applied automatically.** There is no `supabase db push` in
the deploy pipeline — each `.sql` file here must be run by hand against the live
Supabase project (Dashboard → **SQL Editor** → paste → Run) before the code that
depends on it ships.

If you add a migration, also:
1. Run it on production.
2. Update the status table below so the other dev knows it's live.

## Application status (production)

| File | Purpose | Applied to prod |
|------|---------|-----------------|
| 001–012 | Core schema, auth, stats, captain swap, RPCs | ✅ |
| 013_game_sessions_round_unique | Unique index on `game_sessions(round_id)` — stops duplicate sessions from concurrent detect polling | ✅ |
| 014_detection_lease | `detect_claimed_at` column + `claim_detection` RPC — one Bungie scan per detect cycle | ✅ |
| 015–024 | Spectator role, hall of fame RPC, roll settings, clan fields, apply/roll-history fixes and indexes | ✅ |
| 025_challenge_seasons_and_weekly_challenges | Challenge platform: `seasons`, `weekly_challenges`, `weekly_challenge_versions` | ✅ |
| 026_challenge_runs | `challenge_runs`, `challenge_run_participants`, `challenge_run_loadout_slots`, `challenge_run_events` | ✅ |
| 027_run_equipment_and_compliance | `run_equipment_snapshots`, `run_compliance_results` | ✅ |
| 028_pgcr_worker_infra | `pgcr_cache`, `worker_jobs`, `run_processing_events`, `claim_next_worker_job`/`complete_worker_job`/`fail_worker_job` RPCs | ✅ |
| 029_leaderboards | `weekly_leaderboard_entries`, `season_leaderboard_entries`, leaderboard query RPCs | ✅ |
| 030_badges_and_stats | `badges`, `player_badges`, `player_season_stats`/`player_weekly_stats`/`player_lifetime_stats`, `upsert_player_stats_after_run` stub | ✅ |
| 031_challenge_platform_seed | Seed: one draft season, one draft weekly challenge, 5 v1 badges | ✅ |
| 032_lobby_pools | `lobby_pools` cache | ✅ |
| 033_draft_sessions | `draft_sessions`, `draft_picks` (#264 pick/ban draft) | 🗑️ superseded — 034 drops these tables, don't apply on a fresh DB |
| 034_draft_reveal | `lobby_draft_options` (#266 shared 1-of-3 reveal, replaces 033's mechanic) | ✅ |
| 035_lock_down_unused_anon_reads | Drops anon SELECT policies on `roll_history`, `weapon_round_kills`, `lobby_pools`, `player_season_stats`, `player_weekly_stats`, `player_lifetime_stats` (#276) | ✅ |
| 036–055 | Not audited as part of this table - do not infer applied/not-applied status from this README for those files. Check live (`pg_proc`/`information_schema`) before relying on it. | ❓ |
| 056_pg_cron_pings | Moves operational endpoint schedules from GitHub Actions to Supabase pg_cron + pg_net. | ✅ |
| 052_prune_pgcr_cache | `prune_pgcr_cache()` - confirmed live via `pg_stat_statements`/`pg_stat_user_tables` (actively deleting `raw_pgcr` rows). Superseded by 057. | ✅ (superseded) |
| 057_disable_pgcr_prune | Replaces `prune_pgcr_cache()` with a no-op; removes the RPC call from `app/api/cron/sync-crucible`. See [`docs/pgcr-archive.md`](../../docs/pgcr-archive.md). | ✅ |
| 058_pgcr_appwrite_metadata | Adds `appwrite_sha256`/`appwrite_bytes`/`appwrite_migrated_at`/`appwrite_last_verified_at` to `pgcr_cache`, the disjoint archive/clear partial indexes, plus the atomic `mark_pgcr_archived_if_current` RPC. See [`docs/pgcr-archive.md`](../../docs/pgcr-archive.md). | ✅ |
| 059_schedule_pgcr_reconciliation | Schedules the bounded Appwrite outbox retry endpoint every five minutes through Supabase pg_cron. | ⬜ staging first; apply when promoted |

### Challenge platform (025–031)

Applied together, in order — the challenge-platform tables are additive and
don't touch existing lobby/auth/roulette tables. Run all seven before relying
on any Score Attack / Weekly Challenge / badge code that reads these tables.
See [`docs/challenge-platform-schema.md`](../../docs/challenge-platform-schema.md)
for table ownership and RLS boundaries.

### Gotcha if a migration is pending
The detect route calls `claim_detection`. Until 014 is applied that RPC errors,
which the route treats as "not claimed" → it returns `pending` and live
client-side detection pauses. Stats still get recorded by the 5-minute cron
backstop, so nothing is lost — detection just isn't instant until 014 is run.

### Anon RLS: what's still openly readable, and why (#276)
035 locked down every table the browser (anon-key) client never actually
touches. Seven tables are still `USING (true)` for anon on purpose, because
the browser client reads them directly (verified by a full audit of every
`"use client"` file): `lobbies`, `lobby_members`, `lobby_rounds`,
`lobby_loadout_slots`, `lobby_draft_options`, `game_sessions`,
`player_game_stats`. That's the lobby realtime flow, the `/watch/[code]`
spectator page, and the draft board.

This means anyone holding the public anon key (it's embedded in the browser
bundle — not a secret) can still read every row in those seven tables, not
just the lobby they're actually in. NextAuth sessions aren't mapped to
Supabase's own auth, so there's no `auth.uid()` to scope a real per-lobby RLS
policy against. Closing this needs one of:
- Bridging real Supabase auth (issue a Supabase-compatible JWT per NextAuth
  session, then write membership-scoped policies), or
- Dropping `postgres_changes` in favor of server-sent Broadcast messages for
  all the realtime flows above, so the tables themselves can go anon-closed.

Both are a real project, not a policy tweak — acceptable residual risk for a
friends-only beta, revisit before this app is ever public. `weekly_leaderboard_entries`,
`season_leaderboard_entries`, `badges`, and `player_badges` are also anon-readable
but that's intentional (a leaderboard/badge shelf is meant to be public).
