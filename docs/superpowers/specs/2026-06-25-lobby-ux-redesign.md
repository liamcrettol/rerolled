# Lobby UX/UI Redesign — Spec
**Issue:** #130
**Date:** 2026-06-25

---

## Problem

The lobby page is cluttered and overwhelming. Everything is shown at once: character picker, captain controls (with inline form fields), fireteam, stats panel, loadout, weapon pool sidebar. The spin animation uses a setInterval flicker that feels janky and cheap.

## Goal

A cinematic, focused lobby experience. The loadout is the hero. Everything else is secondary and either always-compact or collapsed. The spin animation feels satisfying — a real slot machine.

---

## Layout

Two-column layout on desktop. Single-column on mobile (sidebar stacks below).

### Sidebar (right, ~140px fixed width)

Always visible. Two sections separated by a divider:

1. **Fireteam** — each player: emblem avatar (26×26px), name, class, ✓ checkmark when guardian selected. Captain row uses gold color + crown icon. Spectators shown dimmed.

2. **Your Guardian** (below divider) — compact character chips (class icon + light level). Tapping a chip selects that character (calls the existing `handleSelectCharacter`). Selected chip highlighted with blue border. Replaces the current standalone "Your Character" section in the main column entirely.

### Main Column (top → bottom)

| # | Element | Notes |
|---|---------|-------|
| 1 | **Top bar** | Lobby code (click to copy), round number, status badge. Actions (Leave, Spectate, End Session, Sign out) collapsed into a `···` overflow menu. |
| 2 | **Slot hero** | Three slots centred, 80×80px icons. Damage-type colored borders. Ambient radial glow during rolling. |
| 3 | **Action row** | `🎲 Roll All` (primary pill), `⚡ Apply` (secondary pill), `⚙️` gear icon (settings popover). Captain-only: per-slot `↺` reroll fades in on hover; slot mode indicator (`🎲`/`🔒`/`👤`) below each weapon name is tappable. |
| 4 | **Stats tabs** | Always visible, compact. Session · History · Leaderboard tabs. Content: tight table, ~3 rows before scroll. Post-game banner appears here as a dismissible row. |
| 5 | **Drawers** | Two collapsed drawers: "Roll Settings" and "Weapon Pool". Single tap expands. |

---

## Slot Machine Animation

### Reel mechanics

- Each slot has an `overflow: hidden` container (80×80px).
- Inside: a vertical reel `div` containing 16–18 random weapon icons followed by the final weapon. Each item is 80px tall.
- On roll: animate `translateY` from 0 to `-(totalHeight - 80px)` to scroll the final icon into view.
- Easing: `cubic-bezier(0.1, 0.6, 0.3, 1)` — fast start, dramatic deceleration, snaps.
- Duration: 900ms per slot.
- Stagger: slot 0 = 0ms delay, slot 1 = 160ms, slot 2 = 320ms.
- Preload reel images on intersection load so there's no flicker on first spin.

### Land effect

- On settle: slot border transitions to the weapon's damage-type color.
- A single CSS `@keyframes` glow pulse plays once on the border.
- Weapon name + type fades in beneath the icon (opacity 0 → 1, 150ms).

### Manual pick (from weapon browser)

- No reel. Icon swaps immediately with the existing `pick-pop` animation.

### Wildcard slot

- Shows `👤` placeholder with a gentle `animate-pulse`.
- No spin when set to wildcard.

### Implementation notes

- Replace the current `setInterval` flicker approach in `WeaponSlotContent`.
- Reel is built fresh each roll from the `iconPool` (already preloaded).
- `animKindRef` is already wired — keep using it to distinguish roll vs pick.

---

## Captain Controls (decluttered)

### Always visible (action row only)
- `🎲 Roll All` — primary pill button
- `⚡ Apply` — secondary pill button
- `⚙️` — icon button, opens Roll Settings popover

### Per-slot inline controls (captain only)
- Below each weapon name: a small mode badge (`🎲 Random` / `🔒 Locked` / `👤 Yours`) that cycles on click. Replaces the separate slot-mode button row.
- On hover of a slot: a small `↺` reroll icon appears (top-right corner of the slot icon). Click triggers `handleRoll(slot)`.

### Roll Settings popover (gear icon)
Opens a floating popover (positioned below the gear button, dismisses on outside click):
- Mode select: Normal / Chaos / Meta
- Rerolls / round: Unlimited / 3 / 5 / 10. Shows "N left" counter.
- No duplicates checkbox
- Ban weapon types (the existing chip toggle list)

### Removed from default view
- "Load Shared Weapons" button (captain): triggers automatically on mount as it does today, or shows only if intersection fails (error state).
- "Reroll Kinetic / Energy / Power" buttons: replaced by per-slot hover `↺`.
- Slot mode button row + explanation text: replaced by inline per-slot mode badges.
- Captain panel yellow border box: captain status shown only in the top bar (`👑 Your turn`).

---

## Stats Tabs

No structural change to data or API calls. Visual changes only:

- Tabs are always rendered below the action row (not conditionally).
- Table rows are compact: `py-1.5` instead of `py-2`.
- Post-game result (currently `lastGameStats`) appears as a dismissible banner row above the tabs — a single line with map name, result (W/L), and top performer. Tap to expand into the full `StatsTable` inline.

---

## General Polish

- Gaps between major sections: 24px (up from 16–20px).
- Secondary borders: `border-bungie-border/40` opacity instead of full.
- Loading states: skeleton pulse (`animate-pulse` on a gray rounded rect) instead of "Loading…" text where practical.
- Tailwind config: add `slot-land` keyframe (border glow pulse) and `fade-in` keyframe (opacity 0→1).
- No new color tokens needed; damage-type colors already defined in `weaponShared.tsx`.

---

## Out of Scope

- Mobile layout (responsive cleanup is a separate ticket)
- WatchView page
- Dashboard / LobbyControls page
- Any API or data model changes

---

## Files Affected

| File | Change |
|------|--------|
| `components/LobbyRoom.tsx` | Major restructure: layout, sidebar, top bar overflow menu, action row, stats always-visible, drawers |
| `components/LoadoutQueue.tsx` | Slot machine reel animation, per-slot hover reroll, inline mode badges |
| `components/PlayerCard.tsx` | Slim sidebar variant (26px avatar, compact rows) |
| `tailwind.config.ts` | Add `slot-land` and `fade-in` keyframes/animations |
| `app/globals.css` | Minor: any utility classes needed for reel overflow |
