# Destiny 2 Gun Roulette

Destiny 2 Gun Roulette is a web app for creating random weapon loadouts with friends using the Bungie API.

Users can sign in with their Bungie account, view their Destiny 2 weapons, join a shared lobby, and generate or queue roulette-style weapon loadouts. The app is intended for private group use between matches while players are in orbit.

## Planned Features

- Bungie OAuth sign-in
- Destiny 2 character, inventory, and vault lookup
- Weapon cards with icons, perks, and roll details
- Shared lobby system for friends
- Three-slot loadout queue
- Random weapon selection
- Rotating captain system
- Transfer and equip support through the Bungie API where allowed

## Bungie API Usage

This app uses the Bungie API to read Destiny 2 profile, inventory, vault, and equipment data. With user authorization, it may also move or equip Destiny 2 items.

The app does not store Bungie passwords. Authentication is handled through Bungie OAuth.

## Local Development Setup

### Prerequisites
- Node.js and npm installed
- A Bungie account
- ngrok installed (`brew install ngrok` on macOS)

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
   The server will run on `https://localhost:3000`

4. **Start ngrok in a separate terminal**
   ```bash
   ngrok http 3000
   ```
   This will display a forwarding URL like `https://abc123.ngrok.io`

5. **Create a Bungie API application**
   - Go to https://www.bungie.net/en/Application
   - Create a new application
   - Set the OAuth redirect URL to: `https://YOUR_NGROK_URL/api/auth/callback/bungie`
     - Replace `YOUR_NGROK_URL` with the ngrok URL from step 4
   - Save your Client ID and Client Secret

6. **Configure environment variables**
   - Copy `.env.example` to `.env.local`
   - Add your Bungie Client ID and Client Secret:
     ```
     NEXT_PUBLIC_BUNGIE_CLIENT_ID=YOUR_CLIENT_ID
     BUNGIE_CLIENT_SECRET=YOUR_CLIENT_SECRET
     ```

7. **Test locally**
   - Visit `https://YOUR_NGROK_URL` in your browser
   - Sign in with your Bungie account using the OAuth redirect

### Notes
- The ngrok URL changes each restart. Update your Bungie app's redirect URL if ngrok restarts.
- Keep both the dev server and ngrok running while testing.
- Use `https://` (ngrok provides SSL automatically).

## Deployment URLs

### Production
`https://destiny-gun-roulette.vercel.app`

### Development
Local development uses:

`http://localhost:3000/api/auth/callback/bungie`

## Status

Early development / personal project.

## Developer docs

- [Match detection architecture](docs/match-detection.md) — how games are
  detected, recorded, and how captain rotation works (read this before touching
  the stats pipeline).
- [Weapon variant pooling](docs/weapon-pooling.md) — how re-released / Adept /
  craftable versions of the same gun are grouped (and what's still exact-hash).
- [Database migrations](supabase/migrations/README.md) — migrations are applied
  **by hand**, not automatically. Check the status table before assuming a
  migration is live.

## Contributors

### Development:
- [@liamcrettol](https://github.com/liamcrettol)
- [@jxsoren](https://github.com/jxsoren)

### QA / Testing

- [@Oboluss](https://github.com/Oboluss)

## Disclaimer

This project is not affiliated with, endorsed by, sponsored by, or approved by Bungie. Destiny, Destiny 2, and Bungie are trademarks of Bungie, Inc.
