-- Rerolled activity in the last hour.
-- Read-only aggregate query; exposes no user IDs, names, or tokens.

SELECT
  now() AS checked_at,
  count(*) FILTER (WHERE l.created_at > now() - interval '1 hour')::int AS lobbies_created_last_hour,
  count(*) FILTER (WHERE l.last_active_at > now() - interval '1 hour')::int AS lobbies_active_last_hour,
  count(DISTINCT l.host_user_id) FILTER (WHERE l.created_at > now() - interval '1 hour')::int AS hosts_last_hour,
  count(DISTINCT lm.user_id) FILTER (WHERE l.created_at > now() - interval '1 hour')::int AS participants_last_hour
FROM lobbies l
LEFT JOIN lobby_members lm ON lm.lobby_id = l.id;

SELECT
  count(*) FILTER (WHERE played_at > now() - interval '1 hour')::int AS game_sessions_last_hour,
  count(*) FILTER (
    WHERE played_at > now() - interval '1 hour'
      AND pgcr_instance_id IS NOT NULL
  )::int AS sessions_with_pgcr_last_hour,
  max(played_at) AS latest_session
FROM game_sessions;

SELECT
  status,
  count(*) FILTER (WHERE last_active_at > now() - interval '1 hour')::int AS active_last_hour
FROM lobbies
GROUP BY status
ORDER BY active_last_hour DESC;
