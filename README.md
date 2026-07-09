# Rerolled

Rerolled is a web app for creating random weapon loadouts and challenge runs with friends using the Bungie API.

Users can sign in with their Bungie account, view their Destiny 2 weapons, join a shared lobby, and generate or queue roulette-style weapon loadouts. The app is intended for private group use between matches while players are in orbit.

## Features

- Bungie OAuth sign-in
- Destiny 2 character, inventory, and vault lookup
- Weapon cards with icons, perks, and roll details
- Shared lobby system for friends
- Three-slot loadout queue with a rotating "captain" who rolls from the weapons
  the fireteam owns in common
- Draft mode, endgame lobbies, and a spectator/watch view
- Transfer and equip through the Bungie API where allowed
- Automatic match detection (PGCR) that records per-game and per-weapon stats
- Weekly PvE and PvP challenges, leaderboards, and a hall of fame

## Bungie API Usage

This app uses the Bungie API to read Destiny 2 profile, inventory, vault, and equipment data. With user authorization, it may also move or equip Destiny 2 items.

The app does not store Bungie passwords. Authentication is handled through Bungie OAuth.
See `/privacy` (`app/privacy/page.tsx`) for the full privacy policy — what's stored, why, and how to request deletion.

## Security

See [`SECURITY.md`](SECURITY.md) for how tokens are encrypted, what account/game
data is stored, secret-handling expectations for collaborators, and how to
report a vulnerability.

## Local Development Setup

### Prerequisites
- Node.js and npm installed
- A Bungie account
- ngrok installed — `brew install ngrok` (macOS), `choco install ngrok` or `winget install ngrok.ngrok` (Windows), or download from https://ngrok.com/download

### Steps

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Set up ngrok for local tunneling**
   - Create a free ngrok account at https://ngrok.com
   - Get your auth token from https://dashboard.ngrok.com/auth/your-authtoken
   - Run:
     ```bash
     ngrok config add-authtoken YOUR_AUTHTOKEN
     ```

3. **Start your local dev server**
   ```bash
   npm run dev
   ```
   The server will run on `http://localhost:3000` (plain HTTP — ngrok is what
   provides the HTTPS tunnel Bungie's OAuth requires, see next step)

4. **Start ngrok in a separate terminal**
   ```bash
   ngrok http 3000
   ```
   This will display a forwarding URL like `https://abc123.ngrok.io`

5. **Create a Bungie API application**
   - Go to https://www.bungie.net/en/Application
   - Create a new application
   - Set the OAuth redirect URL to: `https://YOUR_NGROK_URL/api/auth/bungie/callback`
     - Replace `YOUR_NGROK_URL` with the ngrok URL from step 4
   - Save your Client ID and Client Secret

6. **Configure environment variables**
   - Copy `.env.example` to `.env.local` and fill in every value — `.env.example`
     is the source of truth for what's required (Bungie OAuth creds, Supabase
     project keys, `TOKEN_ENCRYPTION_KEY`, `NEXTAUTH_SECRET`). The app won't run
     past the login screen without a working Supabase connection.
   - Bungie creds specifically:
     ```
     BUNGIE_CLIENT_ID=YOUR_CLIENT_ID
     BUNGIE_CLIENT_SECRET=YOUR_CLIENT_SECRET
     ```
   - Optionally, set `BUNGIE_REDIRECT_URI` if your redirect URL differs from the default:
     ```
     BUNGIE_REDIRECT_URI=https://YOUR_NGROK_URL/api/auth/bungie/callback
     ```
     If not set, it defaults to `{NEXTAUTH_URL}/api/auth/bungie/callback`

7. **Test locally**
   - Visit `https://YOUR_NGROK_URL` in your browser
   - Sign in with your Bungie account using the OAuth redirect

### Configuration Notes

- **BUNGIE_REDIRECT_URI**: Optional environment variable for the OAuth redirect URL. By default, it's constructed from `NEXTAUTH_URL`. Set this if you need a custom redirect path (e.g., when using ngrok with a custom domain or testing with different tunneling services).
- **ngrok URL changes**: Each time ngrok restarts, you get a new URL. Update your Bungie app's redirect URL and `.env.local` if ngrok restarts.
- **Keep both services running**: The dev server and ngrok must both be running for OAuth to work.
- **Use https://**: ngrok provides SSL automatically; Bungie API requires HTTPS.

## Deployment URLs

### Production
`https://d2roulette.app` — deploys from the `release` branch.

### Preview / Staging
`https://preview.d2roulette.app` — deploys from the `main` branch (uses a
separate Bungie OAuth app so sign-in works on preview). Promote to production
by merging `main` into `release`.

### Development
Local development uses:

`http://localhost:3000/api/auth/bungie/callback`

## Status

Live and in active development. Production runs at https://d2roulette.app for a
private group of players; new work lands on staging first (see Deployment URLs).

## Developer docs

- [Match detection architecture](docs/match-detection.md) — how games are
  detected, recorded, and how captain rotation works (read this before touching
  the stats pipeline).
- [Weapon variant pooling](docs/weapon-pooling.md) — how re-released / Adept /
  craftable versions of the same gun are grouped (and what's still exact-hash).
- [Weapon/perk data pipeline](docs/weapon-perk-data.md) — how the static
  weapon/perk tables are built and refreshed, the intrinsic frame/archetype
  perk, and the Clarity community data integration (with its attribution
  requirement).
- [Database migrations](supabase/migrations/README.md) — migrations are applied
  **by hand**, not automatically. Check the status table before assuming a
  migration is live.

## Contributors

### Development:
- [@liamcrettol](https://github.com/liamcrettol)
- [@jxsoren](https://github.com/jxsoren)
- [@vxkudo](https://github.com/vxkudo)

### QA / Testing

- [@Oboluss](https://github.com/Oboluss)

## License

Proprietary — all rights reserved. See [`LICENSE`](LICENSE). This is a private
project; no permission is granted to use, copy, or distribute the source.

## Disclaimer

This project is not affiliated with, endorsed by, sponsored by, or approved by Bungie. Destiny, Destiny 2, and Bungie are trademarks of Bungie, Inc.
