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

- Plain SQL in `supabase/migrations/`, numbered sequentially. **Run manually** in the
  Supabase SQL editor (no DB access from here) — write the file AND paste runnable SQL into
  chat. Make migrations idempotent (`IF NOT EXISTS`, `CREATE OR REPLACE`). Some old
  migrations may not be applied live — if you see `column X does not exist`, suspect an
  unapplied migration first.

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
