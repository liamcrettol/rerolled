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

### Gotcha if a migration is pending
The detect route calls `claim_detection`. Until 014 is applied that RPC errors,
which the route treats as "not claimed" → it returns `pending` and live
client-side detection pauses. Stats still get recorded by the 5-minute cron
backstop, so nothing is lost — detection just isn't instant until 014 is run.
