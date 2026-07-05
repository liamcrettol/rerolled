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
| 014_detection_lease | `detect_claimed_at` column + `claim_detection` RPC — one Bungie scan per detect cycle | ⛔ **pending — run before relying on client-side live detection** |
| 015–024 | Spectator role, hall of fame RPC, roll settings, clan fields, apply/roll-history fixes and indexes | ✅ |
| 025_challenge_seasons_and_weekly_challenges | Challenge platform: `seasons`, `weekly_challenges`, `weekly_challenge_versions` | ⛔ **pending — see docs/challenge-platform-schema.md** |
| 026_challenge_runs | `challenge_runs`, `challenge_run_participants`, `challenge_run_loadout_slots`, `challenge_run_events` | ⛔ **pending** |
| 027_run_equipment_and_compliance | `run_equipment_snapshots`, `run_compliance_results` | ⛔ **pending** |
| 028_pgcr_worker_infra | `pgcr_cache`, `worker_jobs`, `run_processing_events`, `claim_next_worker_job`/`complete_worker_job`/`fail_worker_job` RPCs | ⛔ **pending** |
| 029_leaderboards | `weekly_leaderboard_entries`, `season_leaderboard_entries`, leaderboard query RPCs | ⛔ **pending** |
| 030_badges_and_stats | `badges`, `player_badges`, `player_season_stats`/`player_weekly_stats`/`player_lifetime_stats`, `upsert_player_stats_after_run` stub | ⛔ **pending** |
| 031_challenge_platform_seed | Seed: one draft season, one draft weekly challenge, 5 v1 badges | ⛔ **pending** |

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
