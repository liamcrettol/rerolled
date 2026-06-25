# Destiny Gun Roulette - Developer Onboarding

Welcome to the Destiny Gun Roulette project! This guide will help you set up your local development environment.

## Prerequisites

- Node.js 18+
- npm or yarn
- Git
- A Bungie API application (for OAuth)

## Initial Setup

### 1. Clone and Install

```bash
git clone https://github.com/jxsoren/destiny-gun-roulette.git
cd destiny-gun-roulette
npm install
```

### 2. Environment Variables

Copy the example environment file:

```bash
cp .env.example .env.local
```

The following variables need to be filled in:

- `NEXTAUTH_URL` — Set based on your local setup (see sections below)
- `NEXTAUTH_SECRET` — Already generated in `.env.local`
- `BUNGIE_API_KEY` — From your Bungie application
- `BUNGIE_CLIENT_ID` — From your Bungie application
- `BUNGIE_CLIENT_SECRET` — From your Bungie application
- Database credentials (Supabase, PostgreSQL)

## Local Development with ngrok

For local OAuth development, you need to expose your localhost to the internet using ngrok so Bungie can redirect back to you.

### Setup ngrok

1. **Install ngrok:** https://ngrok.com/download

2. **Start ngrok forwarding to port 3000:**

```bash
ngrok http 3000
```

This will output a forwarding URL like: `https://oops-diameter-drift.ngrok-free.dev`

### Update Environment Variables

Once ngrok is running:

```bash
# In .env.local, update:
NEXTAUTH_URL=https://your-ngrok-url.ngrok-free.dev
```

### Register Redirect URI with Bungie

The OAuth callback endpoint is at `/api/auth/bungie/callback`. You need to register this full URL in the Bungie Developer Portal:

1. Go to https://bungie.net/en/Application
2. Select your application
3. Add your redirect URI:
   ```
   https://your-ngrok-url.ngrok-free.dev/api/auth/bungie/callback
   ```

## Bungie API Application Setup

If you don't have a Bungie API application yet:

1. Visit https://www.bungie.net/en/Application
2. Create a new application
3. Copy your credentials into `.env.local`:
   - `BUNGIE_API_KEY` — Your API Key
   - `BUNGIE_CLIENT_ID` — OAuth client_id
   - `BUNGIE_CLIENT_SECRET` — OAuth client_secret

## Running Locally

### With Local Supabase (Recommended for Development)

```bash
# Start Supabase emulation
supabase start

# In another terminal, start the development server
npm run dev
```

The app will be available at `http://localhost:3000`

### With Production/External Supabase

Update your `.env.local` with Supabase credentials, then:

```bash
npm run dev
```

## Testing

Run the test suite:

```bash
npm test
```

Run specific test file:

```bash
npm test lib/bungie/__tests__/equip.test.ts
```

## Common Issues

### "Invalid redirect_uri" Error

**Problem:** The redirect URI doesn't match what's registered in Bungie's portal.

**Solution:**
1. Check that your `NEXTAUTH_URL` matches your ngrok URL
2. Verify the redirect URI in Bungie's developer portal is exactly: `{NEXTAUTH_URL}/api/auth/bungie/callback`
3. Note: ngrok URLs change each session. Update the redirect URI if you get a new ngrok URL

### OAuth State Mismatch

**Problem:** State validation fails during authentication.

**Solution:**
- Ensure your database (`oauth_states` table) is accessible
- Check that `TOKEN_ENCRYPTION_KEY` is set in `.env.local`

### ngrok URL Changes

ngrok free tier assigns a new URL each time you restart. To keep the same URL:

1. Get a static domain at https://dashboard.ngrok.com
2. Update `NEXTAUTH_URL` in `.env.local`
3. Update the redirect URI in Bungie's developer portal

## Architecture Overview

- **Frontend:** Next.js with TypeScript
- **Auth:** NextAuth.js + Bungie OAuth
- **Database:** Supabase (PostgreSQL)
- **API:** Next.js API routes
- **Bungie Integration:** Destiny 2 API client for weapon data and player stats

## Database Migrations

When pulling new changes that include database migrations:

```bash
supabase migration up
# or if using external Supabase
npx ts-node scripts/migrate.ts
```

## Next Steps

- Read the architecture documentation (if available)
- Check existing GitHub issues for context on current work
- Run the test suite to ensure setup is correct
- Create a feature branch for your work: `git checkout -b feature/your-feature`

## Getting Help

- Check existing GitHub issues for common problems
- Review the project structure and comments in the source code
- Consult the Bungie API documentation: https://bungie-net.github.io/
