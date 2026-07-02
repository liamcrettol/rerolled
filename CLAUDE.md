# CLAUDE.md — Destiny 2 Gun Roulette

Operating guide for Claude Code. **Read this fully before acting.** Private repo;
team-visible is fine. Never commit secret *values* (they live in Vercel).

The app: a web app for Destiny 2 friend groups to generate random weapon loadouts
between matches. Bungie OAuth sign-in, shared lobby, a rotating "captain" rolls a
3-slot loadout from the intersection of weapons the fireteam owns; equips via the
Bungie API and auto-detects the finished match (PGCR) to record stats.
Stack: Next.js 15 (App Router) · React 19 · TypeScript · Tailwind · Supabase ·
NextAuth v5 beta (custom Bungie provider) · Axiom (next-axiom) · Vercel (Hobby).

---

## How I want you to work (the core loop)

- **When you finish a requested change** → commit the completed work and push it
  to **`main`** immediately unless I explicitly say not to.
- **I give you a ticket number** → run the `develop-github-issue` skill end-to-end
  and land the work on **`main`**, which deploys to **STAGING** (`preview.d2roulette.app`),
  **not production**.
- **I say "ship it" / "promote" / "make it live"** → promote `main` → `release`,
  which deploys to **PRODUCTION** (`d2roulette.app`).
- **I say "straight to prod"** → do the work and promote in one go (hotfixes only).

**Default is staging-first. Never deploy to production unless I explicitly say so.**

| I say | You do | Lands on |
|---|---|---|
| "do #123" / "work ticket 123" | `develop-github-issue` skill → merge PR to `main` | `preview.d2roulette.app` (staging) |
| "ship it" / "promote" | promote `main` → `release` | `d2roulette.app` (production) |
| "straight to prod" | work + promote in one go | production |

---

## Deploy model (CRITICAL — easy to get wrong)

- **`main` → Preview/Staging → https://preview.d2roulette.app** (Vercel auto-deploys on push).
- **`release` → Production → https://d2roulette.app** (Vercel auto-deploys on push).
- **Merging/pushing to `main` does NOT go live.** Production only updates when `release` updates.
- **Promote to prod:**
  ```bash
  git checkout release && git merge main --ff-only && git push origin release && git checkout main
  ```
  ⚠️ Never let `release` fall behind what's already live, or prod rolls back. If `release`
  is behind `main`, fast-forward it up before relying on it.
- `d2roulette.app` is registered through Vercel (Vercel nameservers), so subdomains
  auto-configure. Production branch and Preview domain pinning are set in
  Vercel → Settings → Environments.

---

## Working a ticket

Use `.claude/skills/develop-github-issue` — **re-read it each time; it evolves** (Josh
updates it). The flow: claim (assign `@me` + `doing` label) → `git pull --rebase origin main`
→ **git worktree** (`git worktree add ../destiny-gun-roulette-wt-<N> -b <type>/<N>-desc`,
NOT `checkout -b`) → implement with `Closes #N` commits → `git fetch && git rebase origin/main`
before push → open PR mirroring the issue's assignee + labels (minus `doing`) → after merge,
swap `doing`→`completed` and `git worktree remove` the worktree. The skill references
`superpowers:*` helper skills that may not exist in every environment — if unavailable,
do those steps manually.

After the PR merges, the work is in **staging**. Wait for "ship it" before promoting to prod.

---

## Team / git norms

- Private repo. Contributors push directly to `main`: **Josh Sorensen (`jxsoren`)**,
  `vxkudo`, and the owner `liamcrettol`. `main` moves under you mid-session —
  **always `git fetch origin && git rebase origin/main` before starting AND before pushing.**
- **Squash before push — one issue = one commit = one deployment.** Develop across as
  many local commits as you like, but squash them into a single `Closes #N` commit
  before pushing to `main`. Each push to `main` triggers a Vercel preview deployment,
  so multiple pushes per issue flood the deployment list. Squash *before* pushing —
  never force-push already-pushed commits on shared `main`.
- Commit footer: `Co-Authored-By: Claude <model> <noreply@anthropic.com>`.
- Windows/PowerShell: git here-strings (`@'...'@`) misparse as pathspecs. Use the Bash
  tool with a `$(cat <<'EOF' ... EOF)` heredoc for multi-line commit messages.
- Track changes with issues. For unfiled ad-hoc work, create an issue and close it with
  the commit SHA.
- ⚠️ Before trusting a "remove dead code" change, verify imports — a teammate once removed
  a "dead" export that wasn't, red-walling all deploys. A fast (<60s) build failure across
  many branches usually means `main` is broken, not your change.

---

## OAuth (Bungie) — two separate apps

- Redirect is derived: `redirect_uri = ${NEXTAUTH_URL}/api/auth/bungie/callback`.
  `NEXTAUTH_URL` must have **no trailing slash** (a slash → `//api/...` → breaks the
  Bungie exact-match).
- **Production app** → redirect `https://d2roulette.app/api/auth/bungie/callback`;
  creds in Production-scoped `BUNGIE_CLIENT_ID` / `BUNGIE_CLIENT_SECRET`.
- **Preview app** (client_id `53228`) → redirect
  `https://preview.d2roulette.app/api/auth/bungie/callback`; creds in Preview-scoped
  vars; Preview `NEXTAUTH_URL=https://preview.d2roulette.app`.
- The duplicate `BUNGIE_CLIENT_ID` / `BUNGIE_CLIENT_SECRET` env entries (one per
  environment) are **intentional** (different apps) — don't dedupe them.
- `invalid_client` / "Client failed to authenticate" at token exchange = the
  `BUNGIE_CLIENT_SECRET` doesn't match that environment's `client_id`. The Bungie app
  must be a **Confidential** OAuth client (Public has no secret); use the OAuth
  client_secret, not the API key; no trailing whitespace; redeploy after fixing.

---

## Vercel environment variables

- Values are **write-only** — `vercel env pull` returns empty `""`. To copy a var across
  environments, edit it in the dashboard and check the target environment's box (no value
  re-entry), or paste the value.
- Vars are **environment-scoped** (Production / Preview / Development). A Production-scoped
  var does NOT exist in Preview unless added. Env changes only affect **new** deployments —
  redeploy after changing (Production: promote `release`; Preview: push `main`).
- Never commit secret values to git.

---

## Build / config invariants (don't undo)

- `.eslintrc.json` registers the `@typescript-eslint` plugin and sets
  `no-explicit-any: off` — `next build` runs lint and the code has inline `no-explicit-any`
  disables. Do **not** reintroduce `eslint.ignoreDuringBuilds` (it was a band-aid).
- `lib/supabase/admin.ts` (`adminSupabase`, service-role) is instantiated **lazily via a
  Proxy** so importing a route doesn't need the service-role key at build time. Keep it lazy.
- `next.config.ts` is wrapped with `withAxiom`; `next-axiom` must stay in deps or the
  config fails to load.

---

## Database migrations

- Plain SQL in `supabase/migrations/`, numbered sequentially. Make migrations idempotent
  (`IF NOT EXISTS`, `CREATE OR REPLACE`). Some old migrations may not be applied live — if
  you see `column X does not exist`, suspect an unapplied migration first.
- **Run it** via `scripts/db-query.mjs` (needs your own `DATABASE_URL` in `.env.local` —
  see below) or by pasting into the Supabase SQL editor, whichever's convenient. Either
  way, actually run new migration files against the live DB — don't just leave them
  sitting in `supabase/migrations/` unapplied.
- `scripts/db-query.mjs` is a general SQL runner (`node scripts/db-query.mjs "SELECT ..."`
  or `node scripts/db-query.mjs path/to/file.sql`), full read/write with RLS bypassed —
  same privilege as the service-role key. Fine for migrations and inspection queries;
  treat it like the SQL editor, not something to run destructive one-liners with against
  prod without thinking twice.
- **Get your own `DATABASE_URL`**: Supabase Dashboard → this project → Settings →
  Database → Connection string → **Session pooler** tab → reveal the password → copy the
  full `postgresql://...` URI → add it to your own `.env.local` as `DATABASE_URL=...`.
  Never paste this value into chat, a committed file, or anywhere outside your own
  `.env.local` (already gitignored). If a password ever ends up somewhere it shouldn't
  (chat transcript, screenshare, etc.), rotate it from that same Database settings page.

---

## Static weapon/perk data pipeline

The app never talks to the Bungie manifest at runtime (it's ~190 MB — a serverless
function would time out/OOM parsing it). Instead `lib/bungie/data/*.json` is a
compact prebuilt set of tables, read at import time as instant in-memory maps via
`lib/bungie/definitions.ts`.

- `scripts/build-weapons-table.mjs` — downloads Bungie's current manifest, extracts
  weapons (`weapons-table.json`) and perk plugs (`perk-names.json`, `perk-data.json`,
  `perk-icons.json`). Skips the download entirely if `manifest-version.txt` already
  matches Bungie's current version, so scheduled runs are cheap.
  - `WeaponDefinition.intrinsicPerkHash` is each weapon's intrinsic frame/archetype
    plug hash — a legendary's frame (e.g. "Rapid-Fire Frame") or an exotic's unique
    named mechanic (e.g. Deterministic Chaos's "Vexadecimal"). Extracted from the
    weapon's **first socket**, where the plug's `plugCategoryIdentifier === "intrinsics"`
    (verified 100% match across the full weapon table — every weapon has this).
  - `COSMETIC_PLUG` in the script excludes shaders/ornaments/masterworks/mods/etc. from
    `perk-data.json` so they never render as a weapon "perk" — **except** catalyst perks,
    which get special-cased back in even though their own `plugCategoryIdentifier` matches
    the `masterwork` keyword (built in a two-pass loop so catalyst hashes are known before
    the exclusion filter runs). `WeaponDefinition.catalystSocketIndex`/`catalystPerkHash`
    are derived from the socket whose *default* plug is "Empty Catalyst Socket"
    (`plugCategoryIdentifier === "v400.empty.exotic.masterwork"`); unlock state is
    per-instance, read live in `rolls/route.ts` by comparing that socket's current
    `plugHash` against `catalystPerkHash`. 99/146 exotics have one — the rest legitimately
    never got a catalyst (MIDA, Sweet Business, Telesto, etc.), not a detection miss.
  - ⚠️ `barrelHash`/`magazineHash`/`masterworkHash` in `rolls/route.ts` are still read from
    **hardcoded socket indices** (1, 2, 6), which do NOT hold across all weapon types —
    confirmed via a full audit (186 distinct socket layouts across the current table, and
    a large fraction of weapons have no default plug at those indices at the definition
    level at all, since randomized perks only resolve from live instance data). Tracked in
    issue #193; deliberately not fixed yet — a wrong fix here is worse than the current bug
    and needs testing against a real account's live inventory, which isn't possible from
    this environment.
- `scripts/sync-clarity-data.mjs` — fills in perk numbers Bungie's manifest doesn't
  expose (exotic percentages/durations, PvP-tuned values — only present as tooltip
  flavor text otherwise), sourced from the community-run
  [Clarity database](https://github.com/Database-Clarity/Live-Clarity-Database) (same
  source D2Foundry/DIM/light.gg use). Downloads `descriptions/lightGG.json`, keeps
  only entries whose hash is already in `perk-data.json`, writes
  `lib/bungie/data/perk-clarity.json`. Surfaced as `PerkInfo.communityDescription` in
  `definitions.ts`, rendered in `components/PerkIcon.tsx` with a required
  **"Perk data: Clarity" attribution credit — don't strip it.**
  [Usage terms](https://www.d2clarity.com/partnerships): free under ~150 users
  provided the data is credited; past that, Clarity wants a licensing conversation.
- `lib/bestRolls.ts` — matches a rolled instance's barrel/magazine/perks against the
  group's curated "ideal roll" per archetype (`data/best-rolls/best-rolls.json`, keyed by
  `"<Weapon Type>|<Frame name>"` — same frame name as `intrinsicPerkHash` above), badged
  in `RollDetails.tsx`. **Current data is an unverified provisional baseline**, not the
  real multi-person reviewed data the workflow in `data/best-rolls/README.md` describes —
  don't present it as vetted community consensus.
- `.github/workflows/refresh-weapons.yml` — runs both scripts every Tuesday (after
  weekly reset) plus on manual dispatch, and auto-commits + pushes
  `lib/bungie/data/*.json` only if something actually changed (so quiet weeks don't
  spam the Vercel deployment list). No new secrets required; picks up
  `BUNGIE_API_KEY` if the repo secret exists, but works without it.
- To refresh by hand: `node scripts/build-weapons-table.mjs && node scripts/sync-clarity-data.mjs`
  (run in that order — the Clarity sync filters against the freshly written `perk-data.json`).

---

## Local bootstrap (fresh device)

```bash
git clone https://github.com/liamcrettol/destiny-gun-roulette.git
cd destiny-gun-roulette
npm install
npx vercel login
npx vercel env pull .env.local   # sensitive values come back empty
```

`next build` may fail locally with `supabaseUrl is required` because sensitive vars pull
empty — that's a local artifact, not a real bug. For a real local build, set the public
`NEXT_PUBLIC_SUPABASE_*` values in `.env.local` manually. `tsc --noEmit` validates types
independently. `npm test` runs Jest.
