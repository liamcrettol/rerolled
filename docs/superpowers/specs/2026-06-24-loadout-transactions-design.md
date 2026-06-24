# Loadout Transactions — Design

**Issues:** [#79 — Enhance "Loadout" component to be Loadout Transactions](https://github.com/liamcrettol/destiny-gun-roulette/issues/79) · [#63 — Allow someone to dismiss errors](https://github.com/liamcrettol/destiny-gun-roulette/issues/63)
**Date:** 2026-06-24
**Status:** Approved

## Problem

The "Loadout" card at the bottom of the lobby page (`components/ApplyStatus.tsx`) lists every weapon-swap API transaction after a player taps Apply. Today each row shows only the player's display name and the slot (e.g. `✅ Guardian · Kinetic`). This is unhelpful:

- You can't tell **which weapon** each transaction was for.
- On failure, the error is a cramped scrap of text (e.g. `Equip status: 0`) with no room for the real underlying cause, and in some code paths the raw Bungie error is **discarded** when a friendly message replaces it.

## Goal

Enhance the same card (no relocation, no removal), **renamed from "Loadout" to "Transaction Logs"**, so each transaction row:

1. Names the weapon involved (icon + name).
2. Makes the slot a prominent, color-coded badge.
3. Lets a failed row **expand in place** to reveal a detailed error (raw technical detail + friendly guidance), toggled on/off per row.

Plus (issue #63): a **"Clear all logs"** action that lets the user dismiss the entire transaction log.

## Non-goals

- No grouping of rows by player (per-row player name is kept, muted/secondary).
- No new persistence schema beyond additive fields on the existing `apply_results` JSONB payload.
- No change to the apply/equip transaction *logic* — only to the data each result carries and how it renders.
- No global "show all details" toggle — expansion is per-row.

## Data model

`ApplyResult` (in `types/lobby.ts`) gains three optional fields. They are optional so older persisted `apply_results` rows (which lack them) still render via fallbacks.

```ts
export interface ApplyResult {
  user_id: string;
  display_name: string;
  slot: WeaponSlot;
  item_hash: number;
  success: boolean;
  error?: string;          // concise, user-facing — shown inline (unchanged)
  weapon_name?: string;    // NEW — weapon for this transaction
  weapon_icon?: string;    // NEW — Bungie icon path (rendered as https://www.bungie.net${weapon_icon})
  error_detail?: string;   // NEW — raw underlying technical error, shown only when a failed row is expanded
  kind?: "vault";          // NEW — marks a vault-clear ("made room") row, which has no real weapon slot
}
```

Rationale: `error` stays the short message shown inline; `error_detail` preserves the raw text that some paths currently throw away. The UI shows `error_detail` in the expanded panel and falls back to `error` when no detail exists.

## Server — enrich results before returning/persisting

All enrichment happens server-side so `ApplyStatus` stays purely presentational, the change works for both realtime updates and DB-loaded history, and the ~1.2 MB weapons table is never shipped to the browser. Weapon name/icon resolve from `item_hash` via `getWeaponDefinition` / the `weaponDefs` map (instant in-memory lookups, no network — see `lib/bungie/definitions.ts`).

### `lib/bungie/equip.ts` (`applyWeapons`)

Already loads `weaponDefs` for tier types. For every `ApplyResult` it pushes (exotic-conflict, Step 1 transfer, Step 2 equip, and the equip catch-all):

- Set `weapon_name` and `weapon_icon` from the weapon definition for that result's `item_hash`.
- In the catch branches that currently substitute a friendly message (notably the Step 1 "Inventory full…" case and the equip failures), set `error_detail` to the raw `err.message` while keeping the existing friendly text in `error`.

Where a result's hash has no definition (shouldn't happen for real weapons), `weapon_name`/`weapon_icon` are simply left undefined and the UI falls back.

### `app/api/apply/route.ts` (POST handler)

Two result groups are built here rather than in `applyWeapons`:

- **Vault-clear results** (`clearResults`): the vaulted weapon is *not* part of the loadout, so resolve its name/icon with `getWeaponDefinition(r.itemHash)`. Set `error_detail` to the raw `r.error` (the existing `error` keeps the `Vaulted to make room: …` framing). Set `kind: "vault"` — these rows have no real weapon slot (the `slot` field is a meaningless `"kinetic"` placeholder), so the UI renders a distinct **VAULTED** badge instead of a slot badge.
- **Missing results** (`missing`): the loadout slot is known, so set `weapon_name`/`weapon_icon` from the slot's `weapon_name`/`weapon_icon` columns.

The enriched `results` array is what's both returned to the client and written to `roll_history.apply_results` (unchanged persistence path).

## UI — `components/ApplyStatus.tsx`

Stays a client component. The card heading reads **"Transaction Logs"** (renamed from "Loadout"). Row layout, left to right:

```
[ SLOT BADGE ]   <icon>  Weapon Name        PlayerName   <status>  <chevron?>
```

- **Slot badge** — prominent, uppercase, color-coded per slot (Kinetic neutral, Energy blue `#00aeef`-tinted, Power purple-tinted). This is the most visually weighted element in the row. For vault-clear rows (`kind === "vault"`) the badge instead reads **VAULTED** in a neutral style, since these rows have no real slot.
- **Weapon** — small (~30px) rounded icon `https://www.bungie.net${weapon_icon}` + `weapon_name`. If `weapon_icon` is absent, skip the `<img>`; if `weapon_name` is absent, fall back to the slot label so older rows still read sensibly.
- **Player name** — muted, right-aligned secondary text (`trimBungieName(display_name)`, unchanged helper). Kept per-row; may repeat across a single player's rows — acceptable per design discussion.
- **Status** — ✅ / ❌ as today.
- **Chevron** — only on failed rows. Toggles a per-row expanded panel.

**Expanded panel** (failed rows only): shown below the row, indented to align under the weapon. Contains:
- Friendly guidance (the `error` text).
- Raw detail block (`error_detail`, falling back to `error` when detail is absent), in a monospace, muted treatment under a small "Detail" label.

**Toggle state**: local `useState` tracking the set of expanded row indices. No persistence. Chevron rotates on open; success rows have no chevron and are not clickable. Respect `prefers-reduced-motion` for the rotation.

Accessibility: the clickable row uses a `<button>` with `aria-expanded` / `aria-controls` and a visible focus state.

A small count pill next to the "Transaction Logs" heading (e.g. `3 transactions`) is included.

### Clearing the log (issue #63)

The card header includes a **"Clear all logs"** control that dismisses the entire transaction log (every row — successes and failures alike), collapsing the card away.

- `ApplyStatus` takes an optional `onClear?: () => void` prop and renders the Clear control only when it's provided.
- State ownership stays in `LobbyRoom`, which already owns `applyResults` (`useState<ApplyResult[]>`). It passes `onClear={() => setApplyResults([])}`. Because the card is rendered only when `applyResults.length > 0`, clearing naturally hides it.
- **Session-only**, no persistence: `applyResults` is already transient (reset on round advance, populated only by the apply response, never loaded from history/realtime). A cleared log reappears on the next Apply. This matches the existing lifecycle and needs no schema change.

## Testing

The test runner is Jest under `jest-environment-node` with **no** React Testing Library / jsdom (see `jest.config.js`; existing tests in `lib/bungie/__tests__/equip.test.ts` are pure-logic). To avoid scope creep we do **not** add a DOM testing stack.

- **Server enrichment (automated):** extend `lib/bungie/__tests__/equip.test.ts` to assert `applyWeapons` results carry `weapon_name`/`weapon_icon` (from definitions) and that failure paths populate `error_detail` with the raw message while `error` keeps the friendly text.
- **Pure helpers (automated, if extracted):** if any display-fallback logic (e.g. "name or slot label") is non-trivial enough to extract into a pure function, unit-test it in the node environment.
- **UI (manual):** verify in the running app that rows show icon + name, slot badges are color-coded, only failed rows expand, and the expanded panel shows detail + guidance. Confirm graceful fallback when loading historical `roll_history` rows that predate the new fields.

## Affected files

| File | Change |
|------|--------|
| `types/lobby.ts` | Add `weapon_name?`, `weapon_icon?`, `error_detail?` to `ApplyResult` |
| `lib/bungie/equip.ts` | Populate the three new fields across all result branches |
| `app/api/apply/route.ts` | Populate new fields for vault-clear + missing results |
| `components/ApplyStatus.tsx` | Rename heading to "Transaction Logs"; new row layout, slot badges, weapon icon+name, per-row expandable detail; "Clear all logs" control via `onClear` prop (#63) |
| `components/LobbyRoom.tsx` | Pass `onClear={() => setApplyResults([])}` to `ApplyStatus` (#63) |
| `lib/bungie/__tests__/equip.test.ts` | Assertions for enriched results |
