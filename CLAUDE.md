# CLAUDE.md — Rerolled

Operating guide for Claude Code. **Read this fully before acting.** Private repo;
team-visible is fine. Never commit secret *values* (they live in Vercel).

The app: a web app for Destiny 2 friend groups to generate random weapon loadouts
between matches. Bungie OAuth sign-in, shared lobby, a rotating "captain" rolls a
3-slot loadout from the intersection of weapons the fireteam owns; equips via the
Bungie API and auto-detects the finished match (PGCR) to record stats.
Rival (`https://rival.rerolled.io`) is the separate product and source of
truth for Crucible match history and head-to-head records.
Stack: Next.js 15 (App Router) · React 19 · TypeScript · Tailwind · Supabase ·
NextAuth v5 beta (custom Bungie provider) · Axiom (next-axiom) · Vercel (Hobby).

---

## How I want you to work (the core loop)

- **When you finish a requested change** → commit the completed work and push it
  to **`main`** immediately unless I explicitly say not to.
- **I give you a ticket number** → run the `develop-github-issue` skill end-to-end
  and land the work on **`main`**, which deploys to **STAGING** (`preview.rerolled.io`),
  **not production**.
- **I say "ship it" / "promote" / "make it live"** → promote `main` → `release`,
  which deploys to **PRODUCTION** (`rerolled.io`).
- **I say "straight to prod"** → do the work and promote in one go (hotfixes only).

**Default is staging-first. Never deploy to production unless I explicitly say so.**

| I say | You do | Lands on |
|---|---|---|
| "do #123" / "work ticket 123" | `develop-github-issue` skill → merge PR to `main` | `preview.rerolled.io` (staging) |
| "ship it" / "promote" | promote `main` → `release` | `rerolled.io` (production) |
| "straight to prod" | work + promote in one go | production |

---

## Deploy model (CRITICAL — easy to get wrong)

- **`main` → Preview/Staging → https://preview.rerolled.io** (Vercel auto-deploys on push).
- **`release` → Production → https://rerolled.io** (Vercel auto-deploys on push).
- **Merging/pushing to `main` does NOT go live.** Production only updates when `release` updates.
- **Promote to prod:**
  ```bash
  git checkout release && git merge main --ff-only && git push origin release && git checkout main
  ```
  ⚠️ Never let `release` fall behind what's already live, or prod rolls back. If `release`
  is behind `main`, fast-forward it up before relying on it.
- `rerolled.io` is registered through Vercel (Vercel nameservers), so subdomains
  auto-configure. Production branch and Preview domain pinning are set in
  Vercel → Settings → Environments.

---

## Working a ticket

Use `.claude/skills/develop-github-issue` — **re-read it each time; it evolves** (Josh
updates it). The flow: claim (assign `@me` + `doing` label) → `git pull --rebase origin main`
→ **git worktree** (`git worktree add ../rerolled-wt-<N> -b <type>/<N>-desc`,
NOT `checkout -b`) → implement with `Closes #N` commits → `git fetch && git rebase origin/main`
before push → open PR mirroring the issue's assignee + labels (minus `doing`) → after merge,
swap `doing`→`completed` and `git worktree remove` the worktree. The skill references
`superpowers:*` helper skills — those are now installed (user-scope plugin, added
2026-07-16), so they resolve for real instead of needing the manual fallback. Relevant
ones: `superpowers:using-git-worktrees` (its own rule is "detect existing isolation first,
never fight the harness" — it should defer to this repo's `rerolled-wt-<N>` convention
above, not invent its own), `superpowers:requesting-code-review` /
`receiving-code-review` (dispatches a subagent reviewer before/after a PR),
`superpowers:finishing-a-development-branch` (end-of-work merge/PR/cleanup checklist).
See "Superpowers plugin" below for how its more opinionated skills interact with this
repo's pace.

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
- **Production app** → redirect `https://rerolled.io/api/auth/bungie/callback`;
  creds in Production-scoped `BUNGIE_CLIENT_ID` / `BUNGIE_CLIENT_SECRET`.
- **Preview app** (client_id `53228`) → redirect
  `https://preview.rerolled.io/api/auth/bungie/callback`; creds in Preview-scoped
  vars; Preview `NEXTAUTH_URL=https://preview.rerolled.io`.
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

## Design system (flat DIM-style — don't drift back to "AI slop")

The whole UI was deliberately redesigned (#243, "remove AI aesthetic") to a flat
armory look — DIM / Trials Report / light.gg, not a generic SaaS template. Liam
notices and rejects the generic look immediately. The rules:

- **Hard edges everywhere: zero border radius.** No `rounded-*` (the lone
  exception is a `rounded-full` circle icon). No gradients, no glassmorphism,
  no scan-lines/grid backdrops, no gold-corner "armory" kitsch, no emoji.
- **Tokens** (globals.css / tailwind `bungie.*`): bg `#101216` (`bungie-dark`),
  panels `#171a1f` (`bungie-surface`), 1px strokes `#2a2e36` (`bungie-border`),
  single accent `#00aeef` (`bungie-blue`, hover `#26bcf3`). System font stack
  (same grotesque family DIM ships) — don't add webfonts.
- **Utilities to reuse, not reinvent:** `.panel` (flat surface + 1px stroke),
  `.section-label` (11px bold uppercase 0.14em-tracked micro-label — used for
  *every* section header), `components/ui/Card.tsx`, `WeaponIcon.tsx`.
  Buttons get a mechanical 1px translate press via global CSS — no scale/ease.
- **Color is semantic, never decorative.** Destiny element colors (Arc `#7bd6ff`,
  Solar `#ff8a3d`, Void `#b58cff`, Stasis `#5b8dff`, Strand `#2fd66f`, Kinetic
  `#d3dae1` — see `DAMAGE_COLORS` in `lib/destiny/constants.ts`) and rarity edges (exotic
  gold `#c7a64a`, legendary purple — `.exotic-border`, HeroReel's `EDGE`) are the
  only things allowed to glow, as thin box-shadow edges on dark tiles.
- **Motion vocabulary lives in `tailwind.config.ts`** (`pick-pop`, `slot-land`,
  `fade-in`, `cyl-spin`, `weapon-land`) plus the scroll-and-land **reel** in
  `components/HeroReel.tsx` — blurred filler icons scrolling vertically in a
  masked window, notching onto the target with an overshoot ease. That reel is
  the app's signature mechanic; reuse it for any new "random reveal" moment
  (LoadoutQueue and DraftBoard already do) instead of inventing a new animation.
- **Layout taste:** fill the viewport (`min-h-[calc(100vh-*)]` + `flex-1`
  centered stage) — Liam calls out dead space. Big uppercase slot/stage titles,
  progress steppers as square bordered pills, trays pinned to the bottom.
  Game-feel references he reaches for: Clash Royale card reveals, slot reels.
- **Never use em dashes (—) anywhere in user-facing text** — page copy, button
  labels, error/toast messages, API error strings, dialog bodies, placeholder
  glyphs. Use a period, comma, or separate sentence instead (a plain hyphen
  `-` is fine for a "no value" table placeholder). Swept the whole app clean
  of them 2026-07-07 — don't reintroduce while writing new copy.

---

## Superdesign skill (design exploration only, not implementation)

Reach for the `superdesign` skill when the task is genuinely about visual
design: a new page/flow that doesn't have a design yet, visual variants of
an existing screen, or pulling a reusable component out of a big file. Its
own trigger rule is explicit: don't invoke it for implementation-only tickets
(state wiring, bug fixes, anything with no visual exploration) — do the code
change directly instead.

- It shells out to an external CLI (`npx --yes @superdesign/cli@latest`) that
  talks to superdesign.dev. First use in this repo needs an interactive
  `... login` — wait for it to finish before the real command. Prompts and
  context files you pass are stored server-side by that service, so treat it
  like any other external tool: never pass secrets, tokens, or real player
  data through `--context-file`/`-p`.
- First invocation here will build `.superdesign/init/` (component/layout/
  route/theme/page inventories) before any design work happens — expected,
  not a bug. Make sure `.superdesign/tmp/` ends up in `.gitignore` (the skill
  is supposed to add it itself; verify it did).
- **Feed it this repo's real design system — don't let it invent one.** The
  "Design system (flat DIM-style)" section above (zero border radius, no
  gradients/glassmorphism, the `bungie.*` tokens, the reel motion vocabulary)
  is the ground truth for `.superdesign/design-system.md`. Always pass the
  real `globals.css`/`tailwind.config.ts` alongside it. If a draft comes back
  with rounded corners, gradients, drop shadows, or a new font, that's the
  tool defaulting to generic-SaaS style and should be rejected/re-prompted,
  not accepted because it "looks nice."
- It always does a pixel-perfect reproduction of the current UI before any
  variation (its own hard rule) — don't try to skip straight to redesign.
- Good current candidates: the Draft board / slot-reveal screens and
  `LobbyRoom.tsx`'s sub-views, neither of which ever had a dedicated design
  pass — `LobbyRoom.tsx` is also a good target for the skill's component-
  extraction mode given its size (~1500 lines).

---

## Superpowers plugin (local to this repo, installed 2026-07-16)

Superpowers (`obra/superpowers-marketplace`) is installed at **local scope**
(`.claude/settings.local.json`, gitignored, personal to this checkout — not shared with
Josh/vxkudo and not active in other projects on this machine). Its skills are worded as
hard requirements ("you do not have a choice") rather than suggestions. The ones most
likely to fire here:

- `brainstorming` — gates any creative/feature work behind a presented-and-approved
  design before implementation starts.
- `test-driven-development` — write the failing test before the implementation code.
- `systematic-debugging` — root-cause analysis required before proposing a bug fix.
- `verification-before-completion` — show real verification output before claiming
  something works or is fixed.

These are good defaults and mostly already match how this repo runs (tests exist,
"ship it" is already an explicit gate, `.claude/skills/develop-github-issue` already
expects a review step). **Don't let the brainstorming/TDD gates add ceremony to the kind
of small, well-scoped work this repo does constantly** — a ticket with a clear scope in
its GitHub issue, or "just fix it," is sufficient signal to skip straight to the fix
rather than running a full brainstorming round first. Reserve the heavier gates for
genuinely new features or when the ask is actually ambiguous.

The other new plugin, `karpathy-guidelines` (andrej-karpathy-skills), needs no
reconciliation — it reinforces habits already codified in this file (surgical diffs, no
speculative abstractions, define verification criteria up front).

## Static analysis (semgrep / codeql, installed 2026-07-16)

Available for a manual security-audit pass (`static-analysis:semgrep` /
`static-analysis:codeql` skills) — relevant given Bungie token handling
(`lib/auth/encrypt.ts`, `TOKEN_ENCRYPTION_KEY`), the service-role Supabase client, and
`scripts/db-query.mjs` (full read/write, RLS bypassed). Good moments to run one: before a
prod promotion that touches auth/tokens/DB access, or as a standalone periodic audit —
not on every commit.

- **Neither `semgrep` nor `codeql` is installed on this machine yet** — the skill will
  fail its prerequisite check until one is (`pip install semgrep` or
  `uv tool install semgrep` for Semgrep; CodeQL needs the CLI bundle from
  github.com/github/codeql-cli-binaries, or `gh extension install github/gh-codeql`).
- Both skills have their own hard approval gate before scanning (present the exact
  ruleset/plan, wait for explicit yes) — they won't run silently.
- Semgrep always runs with `--metrics=off` to avoid phoning home during a security audit
  — keep that when following its instructions.

---

## UI verification (auth'd pages can't render in preview)

Lobby/draft/dashboard pages need a Bungie session + live Supabase lobby, so the
preview browser just redirects to `/`. To actually *see* a UI change: create a
throwaway `app/<thing>-preview/page.tsx` client harness that renders the
component with mock props/data (grab real icon URLs from
`lib/bungie/data/weapons-table.json`), screenshot it via the preview tools,
then **delete the harness before committing**. After deleting a route, also
`rm -rf .next/types/app/<thing>-preview` or `tsc --noEmit` fails on stale
generated route types. Static screenshots can't prove motion — for animation
checks, describe/loop it in the harness (add a Replay button) and let Liam
watch it live in the preview window.

The Playwright MCP (`playwright` server, added 2026-07-16) is a heavier option
for when the sandboxed preview browser genuinely isn't enough — e.g. driving
a real Bungie OAuth redirect end-to-end with a test account, rather than
hitting the auth wall. Default to the harness-and-screenshot approach above
for ordinary UI checks; reach for Playwright specifically when a change needs
verification through an auth-gated flow the harness can't fake.

---

## Gameplay rules the code must respect (Destiny invariants)

Bungie's sandbox rules — enforce them anywhere a loadout is generated
(roulette roll, draft reveal, future modes), don't rediscover them per mode:

- **One exotic per loadout** (HeroReel models this even decoratively).
- **No double Special:** never two Special-ammo weapons across Kinetic+Energy
  (`getWeaponAmmoType()` in `lib/bungie/definitions.ts` returns
  `"Primary" | "Special" | "Heavy"`; see `applyAmmoRules` in
  `lib/draft/optionsService.ts`). Power slot is always Heavy.
- Draft order is fixed Kinetic → Energy → Power; each slot's options are only
  generated after the previous slot commits, so cross-slot rules can filter
  server-side at reveal time. Enforce rules in the API/service layer (captain
  client can't be trusted), with a graceful fallback if filtering would empty
  the pool — show *something* rather than erroring the reveal.

---

## Testing conventions

- Jest, `__tests__/` mirroring source paths (`__tests__/lib/draft/…`). Node env
  via `/** @jest-environment node */` for service code.
- Supabase is mocked with a chainable `makeDb(config)` builder (see
  `__tests__/lib/draft/optionsService.test.ts`) — extend that builder
  (`single`/`maybeSingle`/`list`/`upsertResult`) rather than pulling in a mock
  library.
- **Never let tests depend on `lib/bungie/data/*.json` contents** — those files
  are regenerated weekly by CI. `jest.mock("@/lib/bungie/definitions")` with
  fixed hashes instead.
- Full suite is fast (~2s) — run all of it, plus `tsc --noEmit` and
  `npx next lint --file <changed>` before every push.

---

## Database migrations

- `database_size_bytes()` is checked by the detect-games cron. At 400 MB (80%
  of the 500 MB free-tier allowance), it emits a `[database-capacity] WARNING`
  error for the existing logging pipeline.
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
  - `WeaponDefinition.socketRoleIndices` identifies each weapon's barrel-like,
    magazine-like, and stat-masterwork socket by plug category, including randomized
    plug sets where `singleInitialItemHash` is 0. `rolls/route.ts` and
    `intersection/route.ts` read live per-instance socket data at those role indices
    instead of assuming hardcoded indices (1, 2, 6). (#193)
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
- **There is no "best roll" / "god roll" feature.** It was removed (#323): the
  dataset behind it was an unverified provisional baseline, and the badge presented
  it to players as vetted community consensus. Don't reintroduce a god-roll badge
  without real reviewed data and visible provenance.
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
git clone https://github.com/liamcrettol/rerolled.git
cd rerolled
npm install
npx vercel login
npx vercel env pull .env.local   # sensitive values come back empty
```

`next build` may fail locally with `supabaseUrl is required` because sensitive vars pull
empty — that's a local artifact, not a real bug. For a real local build, set the public
`NEXT_PUBLIC_SUPABASE_*` values in `.env.local` manually. `tsc --noEmit` validates types
independently. `npm test` runs Jest.
