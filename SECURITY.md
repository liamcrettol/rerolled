# Security Policy

Rerolled is an early-development, personal/community project for
Destiny 2 friend groups. It handles user-linked Bungie account data, so this
document explains what is stored, how it is protected, and how to report a
problem. It is meant to be read alongside the [privacy policy](app/privacy/page.tsx)
(`/privacy`); the two should not contradict each other.

## Project status

Early development. Features, storage, and endpoints change frequently. Do not
treat this as a hardened production service. The app is intended for private
group use.

## How Bungie sign-in works (high level)

- Sign-in uses **Bungie.net OAuth**. The app never sees or handles your Bungie
  password — Bungie does, on their own domain.
- After you authorize, Bungie redirects back with a short-lived authorization
  code. The server exchanges that code for an access token (and a refresh token)
  using the app's confidential OAuth client credentials.
- A CSRF `state` value is generated per login, stored server-side, and validated
  on the callback before any token exchange happens.
- With your authorization, the app reads Destiny 2 profile/inventory/equipment
  data and may move or equip items on your behalf via the Bungie API.

## What is stored, and how it is protected

- **Access and refresh tokens** are encrypted at rest with **AES-256-GCM** before
  being written to the database (`lib/auth/encrypt.ts`). The 32-byte key lives
  only in the server environment (`TOKEN_ENCRYPTION_KEY`), never in the client
  bundle or the repo.
- **Bungie membership IDs / types** and your **Bungie display name** are stored to
  identify your account and drive lobby/stat features.
- **Lobby, roll, and match data** (loadouts you rolled, apply/equip actions,
  post-match stats) are stored to power lobbies, leaderboards, and history.
- **Inventory-derived weapon data** is read from the Bungie API to compute roll
  pools. Static weapon/perk definition tables shipped with the app are public
  game data, not user data.

## What is never stored

- Your **Bungie (or platform) password** — authentication is entirely OAuth.
- **Unencrypted** access or refresh tokens.
- Any credential that would let a third party sign in as you outside the Bungie
  OAuth flow.

## Data deletion

You can request deletion of your stored account and game data. See the
[privacy policy](app/privacy/page.tsx) for the current contact path. Deletion
removes your user record, encrypted tokens, and associated lobby/stat rows.

## Secret and access handling (for collaborators)

- **Never commit secret values.** Real secrets live only in the deployment
  environment (Vercel) and each developer's gitignored `.env.local`.
- The **Supabase service-role key** and production environment variables bypass
  row-level security and grant full data access. Only trusted collaborators
  should hold them. Rotate immediately if one is exposed (e.g. pasted into chat,
  a screenshare, or a commit).
- OAuth error responses are logged **server-side only**; user-facing redirects
  carry generic error codes, not raw upstream response bodies.

## Reporting a vulnerability

Please report security issues **privately** — do not open a public issue for a
vulnerability.

- Preferred: open a private [GitHub Security Advisory](https://github.com/liamcrettol/rerolled/security/advisories/new)
  on this repository, or
- Contact the maintainer [@liamcrettol](https://github.com/liamcrettol) directly.

Include enough detail to reproduce the issue (affected endpoint, steps, and
impact). We'll acknowledge the report and work with you on a fix before any
public disclosure. As a small project there is no bug-bounty program, but
good-faith reports are genuinely appreciated.
