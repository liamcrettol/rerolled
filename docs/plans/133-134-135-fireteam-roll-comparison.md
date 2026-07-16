# Implementation Plan: Issues #133, #134, #135

## Your Roll vs Fireteam — Show all member rolls and weapon names

### Context

All three issues improve the **"Your Roll vs Fireteam"** panel rendered by `components/RollDetails.tsx`. Its data comes from the POST route `app/api/roulette/rolls/route.ts` and flows through `LobbyRoom.tsx` unchanged (it just passes `rollsData` straight to `<RollDetails>`).

### Issue Interpretation

- **#135** — Slot tabs currently read "Kinetic / Energy / Power"; change them to the actual weapon names.
- **#134** — Also show the weapon name + gun icon in the section (pairs with #135).
- **#133** — Currently only your full roll (barrel/mag/perks/masterwork icons) is shown; other fireteam members show only stat numbers. Show each member's full roll the same way yours is shown.

### Strategy

**Do all three in ONE branch/PR** — they touch the same component and share one API change; splitting them would just create conflicts. Branch: `feature/133-fireteam-roll-comparison`, and put `Closes #133`, `Closes #134`, `Closes #135` in the PR body.

⚠️ **Match on code, not line numbers** — `main` moves; line numbers below are approximate.

---

## Step 1: Plumb weapon name + icon through (enables #134 & #135)

The weapon definition already has `name` and `icon` (`WeaponDefinition` in `lib/bungie/definitions.ts:23-24`), loaded via `getWeaponDefinitions`. Just pass them through.

### `app/api/roulette/rolls/route.ts`

1. Extend the `slots` record type (~line 204) to include:
   ```ts
   weaponName: string;
   weaponIcon: string;
   ```

2. Where each slot object is built (~line 232), add:
   ```ts
   weaponName: defs.get(hash)?.name ?? "",
   weaponIcon: defs.get(hash)?.icon ?? "",
   ```
   Keep the existing `itemHash`, `damageType`, `baseStats`, `members`.

### `components/RollDetails.tsx`

Add to the `SlotRolls` interface (~line 34):
```ts
weaponName?: string;
weaponIcon?: string;
```

**No change needed in `LobbyRoom.tsx`** — it passes the payload through untouched.

### Icon URL Handling

Bungie icons are relative paths. Render with the `www.bungie.net` prefix the codebase already uses for icons. Check how `renderSocketIcon` / `barrelIcon` URLs are formed — perk icons come pre-prefixed from `getPerkIcons`. Confirm whether `WeaponDefinition.icon` is a full URL or a `/common/...` path, and prefix with `https://www.bungie.net` if it's a path.

---

## Step 2: #135 — Slot tabs show weapon names

In the tab buttons (~line 136-148), replace `{SLOT_LABELS[s]}` with the weapon name:

```tsx
{rolls[s]!.weaponName || SLOT_LABELS[s]}
```

- Keep the existing damage-type color theme (`damageTheme`).
- Weapon names are long — add `truncate max-w-[8rem]` (or similar) to the button so the tab row doesn't overflow. Keep `SLOT_LABELS` as the fallback.

---

## Step 3: #134 — Weapon icon + name in the section

Make each slot tab show `[gun icon] [weapon name]`:

1. Inside each tab button, render:
   ```tsx
   {rolls[s]!.weaponIcon && <img src={rolls[s]!.weaponIcon} className="w-4 h-4 rounded-sm" />}
   {rolls[s]!.weaponName || SLOT_LABELS[s]}
   ```

2. Optionally also show the active weapon's icon + name larger in the panel body header (above the sockets), for clarity. Keep it subtle — match existing `text-xs`/`text-sm` sizing and `bungie-*` tokens.

---

## Step 4: #133 — Show every member's full roll

Today the "Your Roll" block (~lines 200-216) renders only `myChosen`'s sockets as a single `col-span-full` row. Replace it with a per-member sockets row so each member's column shows their own roll.

1. **Reuse existing helpers:** `shownFor(m)` (your chosen instance for you, first instance for others) and `renderSocketIcon`.

2. **New row structure** (matching the grid: label cell + one cell per member):
   - **Label cell:** `"Roll"` (replaces `"Your Roll"`).
   - **For each member `m`:** render `shownFor(m)`'s `barrel → magazine → perks → masterwork` icons (same order/logic as the current your-roll block) inside that member's column, wrapped to fit the `15rem` column (`flex flex-wrap gap-1`).
   - **If `m.failed`** → show a small muted "couldn't load" note in that cell.
   - **If `shownFor(m)` is undefined** (member doesn't own the gun) → show a muted "—" / "not owned".

3. **Keep your swap-instance chips + favorite star** (currently in the header row, ~lines 164-191) working for `isMe`.

**Critical:** Keep the grid template (`gridCols`, label col + per-member cols) intact; you're swapping the single full-span sockets row for a per-column sockets row.

---

## Verification (before opening the PR)

1. `npx tsc --noEmit` — clean.
2. `npx next lint` — no new errors (warnings about `<img>` are pre-existing and fine).
3. `npm run build` — succeeds.
4. Manually reason through: 1-member lobby (just you), multi-member, a `failed` member, and a member who doesn't own the weapon — each should render without crashing.

---

## Workflow (follow `CLAUDE.md` + the `develop-github-issue` skill)

1. `git fetch origin && git checkout main && git pull --rebase origin main`.
2. Claim: `gh issue edit 133 --add-assignee @me --add-label doing` (and 134, 135).
3. Worktree: `git worktree add ../rerolled-wt-133 -b feature/133-fireteam-roll-comparison`.
4. Implement Steps 1-4; commit with `Closes #133` / `Closes #134` / `Closes #135` in the body.
5. `git fetch origin && git rebase origin/main`, then push.
6. Open ONE PR (assignee + labels mirrored, minus `doing`), closing all three issues.
7. Merge → lands on `main` = staging (`preview.rerolled.io`). **Stop there — do NOT promote to prod.** Liam verifies on staging and says "ship it."
8. After merge: swap `doing`→`completed` on all three; `git worktree remove`.
