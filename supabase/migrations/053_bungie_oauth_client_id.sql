-- ============================================================
-- 053 - Record which Bungie OAuth app issued each token set
-- ============================================================
-- Preview and production are separate Bungie OAuth apps sharing this table. A
-- refresh token can only be redeemed by the app that issued it, so background
-- jobs running under one app silently fail for users who signed in through the
-- other. Recording the issuing client_id makes the mismatch diagnosable and
-- lets the refresh path fail fast with a clear error. Backfilled rows stay
-- null until the user's next sign-in or successful refresh.

alter table bungie_accounts add column if not exists oauth_client_id text;
