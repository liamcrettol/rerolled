# Loadout Transactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the "Loadout" card to "Transaction Logs" and enhance it so each weapon-swap transaction names the weapon (icon + name), shows a prominent color-coded slot badge, and lets failed rows expand in place to reveal a detailed error — plus a "Clear all logs" control to dismiss the log (#63).

**Architecture:** Add three optional fields to `ApplyResult` (`weapon_name`, `weapon_icon`, `error_detail`). Enrich results server-side — in `lib/bungie/equip.ts` (the equip/transfer paths) and `app/api/apply/route.ts` (vault-clear + missing paths) — using the static in-memory weapon definitions (no network). Rewrite `components/ApplyStatus.tsx` as a presentational client component that renders the enriched rows with a per-row expand toggle.

**Tech Stack:** Next.js 15 / React 19 / TypeScript, Tailwind (custom `bungie-*` tokens), Jest (`jest-environment-node`, ts-jest — no DOM testing library).

**Spec:** `docs/superpowers/specs/2026-06-24-loadout-transactions-design.md`

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `types/lobby.ts` | `ApplyResult` shape | Add 3 optional fields (Task 1) + `kind?: "vault"` (Task 3.5) |
| `lib/bungie/equip.ts` | Build equip/transfer `ApplyResult`s | DRY all result-pushes through one enrich helper; add raw `error_detail` |
| `app/api/apply/route.ts` | Build vault-clear + missing `ApplyResult`s | Resolve weapon name/icon; add `error_detail`; mark vault rows `kind: "vault"` (Task 3.5) |
| `components/ApplyStatus.tsx` | Render transaction log | Full rewrite: "Transaction Logs" heading, slot badge, icon+name, per-row expandable detail, "Clear all logs" control (#63) |
| `components/LobbyRoom.tsx` | Owns `applyResults` state | Pass `onClear` to `ApplyStatus` (#63) |
| `lib/bungie/__tests__/equip.test.ts` | Unit tests for `applyWeapons` enrichment | Add a `describe("applyWeapons result enrichment")` block |

---

## Task 1: Add new fields to the `ApplyResult` type

**Files:**
- Modify: `types/lobby.ts:63-70`

- [ ] **Step 1: Add the three optional fields**

Replace the existing `ApplyResult` interface (currently `types/lobby.ts:63-70`) with:

```ts
export interface ApplyResult {
  user_id: string;
  display_name: string;
  slot: WeaponSlot;
  item_hash: number;
  success: boolean;
  error?: string; // concise, user-facing message (shown when a failed row is expanded)
  weapon_name?: string; // weapon involved in this transaction
  weapon_icon?: string; // Bungie icon path, rendered as https://www.bungie.net${weapon_icon}
  error_detail?: string; // raw underlying technical error (shown under "Detail" when expanded)
}
```

- [ ] **Step 2: Verify the project still type-checks**

Run: `npx tsc --noEmit`
Expected: exits 0 (no new errors). The added fields are optional, so existing call sites still compile.

- [ ] **Step 3: Commit**

```bash
git add types/lobby.ts
git commit -m "feat: add weapon_name, weapon_icon, error_detail to ApplyResult (#79)"
```

---

## Task 2: Enrich `applyWeapons` results in `lib/bungie/equip.ts`

`applyWeapons` already loads `weaponDefs` (a `Map<number, WeaponDefinition>`) at `lib/bungie/equip.ts:199-200`. We route every result-push through one helper that attaches `weapon_name`/`weapon_icon` from that map, and we capture the raw error in `error_detail` on the catch branches that currently substitute a friendly message.

**Files:**
- Modify: `lib/bungie/equip.ts` (the `applyWeapons` function, lines ~188-446)
- Test: `lib/bungie/__tests__/equip.test.ts`

- [ ] **Step 1: Write the failing tests**

Append this block to the END of `lib/bungie/__tests__/equip.test.ts`. It mocks `../definitions` so weapon name/icon are deterministic, and `../client` (already mocked at the top of the file) for the Bungie HTTP calls.

```ts
import { applyWeapons } from "../equip";
import { getWeaponDefinitions } from "../definitions";

jest.mock("../definitions");

describe("applyWeapons result enrichment", () => {
  const HASH = 5001;
  const ICON = "/common/destiny2_content/icons/riptide.jpg";

  beforeEach(() => {
    jest.clearAllMocks();
    (getWeaponDefinitions as jest.Mock).mockResolvedValue(
      new Map([
        [
          HASH,
          {
            itemHash: HASH,
            name: "Riptide",
            icon: ICON,
            weaponType: "Fusion Rifle",
            ammoType: "Special",
            damageType: "Stasis",
            tierName: "Legendary",
            tierType: 5,
            flavorText: "",
            defaultBucketHash: 0,
            stats: {},
            intrinsicPerk: null,
          },
        ],
      ])
    );
  });

  it("attaches weapon_name and weapon_icon on a successful equip", async () => {
    (clientModule.bungiePost as jest.Mock).mockResolvedValue({
      equipResults: [{ itemInstanceId: "inst-1", equipStatus: 1 }],
    });

    const weapons = [
      {
        itemHash: HASH,
        itemInstanceId: "inst-1",
        slot: "energy" as const,
        location: "character" as const,
        characterId: "char-1",
      },
    ];

    const results = await applyWeapons(weapons, "char-1", 2, "token", "u1", "Guardian#1234", []);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].weapon_name).toBe("Riptide");
    expect(results[0].weapon_icon).toBe(ICON);
  });

  it("keeps friendly error and captures raw error_detail on a no-room transfer failure", async () => {
    (clientModule.bungiePost as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("TransferItem")) {
        return Promise.reject(new Error("Bungie code 1642 DestinationFull"));
      }
      return Promise.resolve({ equipResults: [] });
    });

    // location "vault" forces a transfer; empty roster means makeRoom finds no spare and gives up.
    const weapons = [
      {
        itemHash: HASH,
        itemInstanceId: "inst-1",
        slot: "energy" as const,
        location: "vault" as const,
      },
    ];

    const results = await applyWeapons(weapons, "char-1", 2, "token", "u1", "Guardian#1234", []);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].error).toBe(
      "Inventory full and no spare weapon to move — clear a slot, then Apply again"
    );
    expect(results[0].error_detail).toBe("Bungie code 1642 DestinationFull");
    expect(results[0].weapon_name).toBe("Riptide");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- equip.test.ts -t "result enrichment"`
Expected: FAIL — both assertions on `weapon_name`/`error_detail` fail (fields are currently `undefined`).

- [ ] **Step 3: Add the enrich helper inside `applyWeapons`**

In `lib/bungie/equip.ts`, immediately after the `weaponDefs` map is built (after the line `const weaponDefs = await getWeaponDefinitions(Array.from(uniqueHashes));`, ~line 200), add this helper:

```ts
  const makeResult = (
    slot: WeaponSlot,
    itemHash: number,
    success: boolean,
    error?: string,
    errorDetail?: string
  ): ApplyResult => {
    const def = weaponDefs.get(itemHash);
    return {
      user_id: userId,
      display_name: displayName,
      slot,
      item_hash: itemHash,
      success,
      error,
      error_detail: errorDetail,
      weapon_name: def?.name,
      weapon_icon: def?.icon,
    };
  };
```

- [ ] **Step 4: Route every `results.push({...})` in `applyWeapons` through `makeResult`**

There are six push sites. Replace each object literal with a `makeResult(...)` call.

4a. Exotic-conflict transfer failure (currently `lib/bungie/equip.ts:314-321`):

```ts
          results.push(
            makeResult(
              conflictSlot,
              conflictingExotic.itemHash,
              false,
              err instanceof Error ? err.message : "Failed to transfer weapon to clear exotic conflict",
              err instanceof Error ? err.message : undefined
            )
          );
```

4b. Exotic-conflict "no legendary available" (currently `lib/bungie/equip.ts:328-335`):

```ts
      results.push(
        makeResult(
          conflictSlot,
          conflictingExotic.itemHash,
          false,
          `Cannot swap out exotic in ${conflictSlot} slot — no legendary available`
        )
      );
```

4c. Exotic-conflict equip failure (currently `lib/bungie/equip.ts:350-357`):

```ts
      results.push(
        makeResult(
          conflictSlot,
          conflictingExotic.itemHash,
          false,
          err instanceof Error ? err.message : "Failed to swap out conflicting exotic",
          err instanceof Error ? err.message : undefined
        )
      );
```

4d. Step 1 transfer failure — the key one where friendly text replaces raw (currently `lib/bungie/equip.ts:382-392`). Replace the `const friendly = ...` block and the push with:

```ts
      const raw = err instanceof Error ? err.message : "Transfer failed";
      const friendly = isNoRoomError(err)
        ? "Inventory full and no spare weapon to move — clear a slot, then Apply again"
        : raw;
      results.push(makeResult(weapon.slot, weapon.itemHash, false, friendly, raw));
```

4e. Step 2 batch-equip per-weapon result (currently `lib/bungie/equip.ts:419-429`):

```ts
      results.push(
        makeResult(
          weapon.slot,
          weapon.itemHash,
          equipResult?.equipStatus === 1,
          equipResult?.equipStatus !== 1 ? `Equip status: ${equipResult?.equipStatus}` : undefined
        )
      );
```

4f. Step 2 batch-equip throw fallback (currently `lib/bungie/equip.ts:434-441`):

```ts
      results.push(
        makeResult(
          weapon.slot,
          weapon.itemHash,
          false,
          err instanceof Error ? err.message : "Equip failed",
          err instanceof Error ? err.message : undefined
        )
      );
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- equip.test.ts`
Expected: PASS — the new enrichment tests pass and all pre-existing `equip.test.ts` tests still pass.

- [ ] **Step 6: Commit**

```bash
git add lib/bungie/equip.ts lib/bungie/__tests__/equip.test.ts
git commit -m "feat: enrich applyWeapons results with weapon name/icon and raw error detail (#79)"
```

---

## Task 3: Enrich vault-clear and missing results in `app/api/apply/route.ts`

The route builds two result groups outside `applyWeapons`: vault-clear results (weapon not in the loadout — resolve via `getWeaponDefinition`) and "missing" results (loadout slot is known — use the slot's columns). No automated test infra exists for this Next route, so this task is verified by type-check, lint, and manual run.

**Files:**
- Modify: `app/api/apply/route.ts`

- [ ] **Step 1: Import `getWeaponDefinition`**

In `app/api/apply/route.ts`, add it to the existing definitions import (or add a new import near the other `lib/bungie` imports at the top, lines 4-10):

```ts
import { getWeaponDefinition } from "@/lib/bungie/definitions";
```

- [ ] **Step 2: Add weapon name/icon to the "missing" result**

Replace the `missing.push({...})` object (currently `app/api/apply/route.ts:84-91`) with:

```ts
        missing.push({
          user_id: session.userId,
          display_name: session.displayName,
          slot: slot.slot as WeaponSlot,
          item_hash: slot.item_hash,
          success: false,
          error: `Not in inventory - pull ${slot.weapon_name} from Collections in-game, then Apply again`,
          weapon_name: slot.weapon_name,
          weapon_icon: slot.weapon_icon,
        });
```

- [ ] **Step 3: Resolve weapon name/icon for vault-clear results**

Replace the `results` assembly block (currently `app/api/apply/route.ts:133-144`) with the following. It enriches each vault-clear result via an in-memory definition lookup and preserves the raw error in `error_detail`:

```ts
    const clearResultsEnriched = await Promise.all(
      clearResults.map(async (r) => {
        const def = await getWeaponDefinition(r.itemHash);
        return {
          user_id: session.userId,
          display_name: session.displayName,
          slot: "kinetic" as WeaponSlot, // vault operations don't have a specific slot
          item_hash: r.itemHash,
          success: r.success,
          error: r.error ? `Vaulted to make room: ${r.error}` : undefined,
          error_detail: r.error,
          weapon_name: def?.name,
          weapon_icon: def?.icon,
        };
      })
    );

    const results = [...clearResultsEnriched, ...equipResults, ...missing];
```

- [ ] **Step 4: Verify type-check and lint pass**

Run: `npx tsc --noEmit && npm run lint`
Expected: both exit 0. (`getWeaponDefinition` returns `WeaponDefinition | null`, so `def?.name`/`def?.icon` are correctly typed.)

- [ ] **Step 5: Commit**

```bash
git add app/api/apply/route.ts
git commit -m "feat: resolve weapon name/icon for vault-clear and missing apply results (#79)"
```

---

## Task 3.5: Mark vault-clear rows with `kind: "vault"` (#79 UX wrinkle)

Vault-clear rows carry a meaningless `slot: "kinetic"`. Add an additive discriminator so the component can render a neutral **VAULTED** badge instead of a misleading slot badge.

**Files:**
- Modify: `types/lobby.ts` (the `ApplyResult` interface)
- Modify: `app/api/apply/route.ts` (the `clearResultsEnriched` map)

- [ ] **Step 1: Add the `kind` field to `ApplyResult`**

In `types/lobby.ts`, add one line to the `ApplyResult` interface, right after `error_detail?: string;`:

```ts
  kind?: "vault"; // marks a vault-clear ("made room") row, which has no real weapon slot
```

- [ ] **Step 2: Set `kind: "vault"` on vault-clear results**

In `app/api/apply/route.ts`, inside the `clearResultsEnriched` map's returned object (the one that already sets `error_detail`/`weapon_name`/`weapon_icon`), add:

```ts
          kind: "vault" as const,
```

So the returned object becomes (full object for clarity):

```ts
        return {
          user_id: session.userId,
          display_name: session.displayName,
          slot: "kinetic" as WeaponSlot, // vault operations don't have a specific slot
          item_hash: r.itemHash,
          success: r.success,
          error: r.error ? `Vaulted to make room: ${r.error}` : undefined,
          error_detail: r.error,
          weapon_name: def?.name,
          weapon_icon: def?.icon,
          kind: "vault" as const,
        };
```

- [ ] **Step 3: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add types/lobby.ts app/api/apply/route.ts
git commit -m "feat: mark vault-clear transactions with kind so UI shows a VAULTED badge (#79)"
```

---

## Task 4: Rewrite `components/ApplyStatus.tsx` with the enhanced row layout

Presentational client component. Heading reads "Transaction Logs". Slot badge (prominent, color-coded), weapon icon + name, muted player name, status, and a per-row expand chevron on failed rows revealing guidance + raw detail. A "Clear all logs" control in the header calls an optional `onClear` prop (issue #63). Falls back gracefully for older persisted rows missing the new fields. No DOM testing library exists, so this is verified by type-check, lint, and manual run.

**Files:**
- Modify: `components/ApplyStatus.tsx` (full rewrite)

- [ ] **Step 1: Replace the file contents**

Overwrite `components/ApplyStatus.tsx` with:

```tsx
"use client";

import { useState } from "react";
import type { ApplyResult } from "@/types/lobby";
import { trimBungieName } from "@/lib/utils";

const SLOT_LABELS: Record<string, string> = {
  kinetic: "Kinetic",
  energy: "Energy",
  power: "Power",
};

const SLOT_BADGE_CLASSES: Record<string, string> = {
  kinetic: "text-gray-300 bg-gray-400/10 border-gray-400/30",
  energy: "text-bungie-blue bg-bungie-blue/10 border-bungie-blue/30",
  power: "text-purple-300 bg-purple-500/10 border-purple-500/30",
};

// Vault-clear rows ("made room") have no real slot — show a distinct neutral badge.
const VAULT_BADGE_CLASS = "text-amber-300/90 bg-amber-500/10 border-amber-500/30";

export default function ApplyStatus({
  results,
  onClear,
}: {
  results: ApplyResult[];
  onClear?: () => void;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggle = (i: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  return (
    <div className="bg-bungie-surface border border-bungie-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h2 className="text-white font-semibold flex items-center gap-2">
          Transaction Logs
          <span className="text-xs font-medium text-gray-400 bg-bungie-dark border border-bungie-border px-2 py-0.5 rounded-full">
            {results.length} {results.length === 1 ? "transaction" : "transactions"}
          </span>
        </h2>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            className="text-xs text-gray-400 hover:text-white border border-bungie-border hover:border-gray-500 rounded-md px-2.5 py-1 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-bungie-blue"
          >
            Clear all logs
          </button>
        )}
      </div>
      <div className="space-y-2">
        {results.map((r, i) => {
          const isVault = r.kind === "vault";
          const slotLabel = SLOT_LABELS[r.slot] ?? r.slot;
          const badgeLabel = isVault ? "Vaulted" : slotLabel;
          const badgeClass = isVault
            ? VAULT_BADGE_CLASS
            : SLOT_BADGE_CLASSES[r.slot] ?? SLOT_BADGE_CLASSES.kinetic;
          const weaponName = r.weapon_name ?? (isVault ? "Weapon" : slotLabel);
          const isOpen = expanded.has(i);
          const canExpand = !r.success;
          const detailText =
            r.error_detail && r.error_detail !== r.error ? r.error_detail : null;

          const rowInner = (
            <>
              <span
                className={`flex-shrink-0 uppercase tracking-wide text-[11px] font-bold px-2.5 py-1 rounded-md min-w-[76px] text-center border ${badgeClass}`}
              >
                {badgeLabel}
              </span>
              <span className="flex items-center gap-2 min-w-0">
                {r.weapon_icon && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`https://www.bungie.net${r.weapon_icon}`}
                    alt=""
                    className="w-[30px] h-[30px] rounded border border-bungie-border flex-shrink-0"
                  />
                )}
                <span className="font-semibold text-white truncate">{weaponName}</span>
              </span>
              <span className="ml-auto text-gray-400 text-[13px] whitespace-nowrap">
                {trimBungieName(r.display_name)}
              </span>
              <span className="flex-shrink-0 text-[15px]">{r.success ? "✅" : "❌"}</span>
              {canExpand && (
                <span
                  className={`flex-shrink-0 w-4 text-center text-gray-400 transition-transform motion-reduce:transition-none ${
                    isOpen ? "rotate-180" : ""
                  }`}
                  aria-hidden="true"
                >
                  ⌄
                </span>
              )}
            </>
          );

          return (
            <div
              key={i}
              className={`rounded-lg overflow-hidden text-sm ${
                r.success
                  ? "bg-green-900/30 border border-green-700/40"
                  : "bg-red-900/30 border border-red-700/40"
              }`}
            >
              {canExpand ? (
                <button
                  type="button"
                  onClick={() => toggle(i)}
                  aria-expanded={isOpen}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-bungie-blue"
                >
                  {rowInner}
                </button>
              ) : (
                <div className="flex items-center gap-3 px-3 py-2.5">{rowInner}</div>
              )}

              {canExpand && isOpen && (
                <div className="px-3 pb-3 ml-[88px]">
                  <div className="border-l-2 border-red-700/50 pl-3 flex flex-col gap-2 pt-1">
                    {r.error && <div className="text-gray-200 text-[13px]">{r.error}</div>}
                    {detailText && (
                      <div className="text-gray-400 text-xs font-mono">
                        <span className="block uppercase tracking-wide text-[10px] text-gray-500 mb-0.5 font-sans">
                          Detail
                        </span>
                        {detailText}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify type-check and lint pass**

Run: `npx tsc --noEmit && npm run lint`
Expected: both exit 0.

- [ ] **Step 3: Manual verification in the running app**

Run: `npm run dev`, open a lobby, roll a loadout, and Apply. Confirm:
- Each row shows a color-coded slot badge, the weapon icon + name, and the muted player name.
- Successful rows show ✅ and are NOT clickable (no chevron).
- Failed rows show ❌ and a chevron; clicking toggles a panel with the guidance and (when distinct) a "Detail" block with the raw error.
- Rolling/applying a brand-new loadout still works (new fields populate). If you have a `roll_history` row that predates this change, its rows render with the slot label in place of a missing weapon name and no broken image.

(The "Clear all logs" button and its end-to-end behavior are verified after Task 5, once `onClear` is wired in `LobbyRoom`. At this point the button does not yet appear because `LobbyRoom` doesn't pass `onClear`.)

- [ ] **Step 4: Commit**

```bash
git add components/ApplyStatus.tsx
git commit -m "feat: Transaction Logs card — weapon, slot badge, expandable error, clear control (#79, #63)"
```

---

## Task 5: Wire the "Clear all logs" control in `components/LobbyRoom.tsx` (#63)

`LobbyRoom` owns the `applyResults` state (`const [applyResults, setApplyResults] = useState<ApplyResult[]>([])` at `components/LobbyRoom.tsx:249`) and renders `<ApplyStatus>` only when there are results (`components/LobbyRoom.tsx:1409`). Pass an `onClear` callback that resets the results, which hides the card. Session-only — `applyResults` is already transient.

**Files:**
- Modify: `components/LobbyRoom.tsx:1409`

- [ ] **Step 1: Pass `onClear` to `ApplyStatus`**

Replace the render line (currently `components/LobbyRoom.tsx:1409`):

```tsx
        {applyResults.length > 0 && <ApplyStatus results={applyResults} />}
```

with:

```tsx
        {applyResults.length > 0 && (
          <ApplyStatus results={applyResults} onClear={() => setApplyResults([])} />
        )}
```

- [ ] **Step 2: Verify type-check and lint pass**

Run: `npx tsc --noEmit && npm run lint`
Expected: both exit 0.

- [ ] **Step 3: Manual verification in the running app**

With `npm run dev`, after an Apply produces transaction rows: confirm a "Clear all logs" button appears in the card header, and clicking it removes the entire Transaction Logs section (all rows, successes and failures). Confirm the log reappears on the next Apply.

- [ ] **Step 4: Commit**

```bash
git add components/LobbyRoom.tsx
git commit -m "feat: wire Clear all logs control for transaction log (#63)"
```

---

## Self-Review Notes

- **Spec coverage:** weapon icon+name (Tasks 2-4) ✓; prominent color-coded slot badge (Task 4) ✓; per-row expandable detailed error with raw + guidance (Tasks 2-4) ✓; additive optional fields / graceful fallback (Tasks 1, 4) ✓; server-side enrichment so client stays presentational (Tasks 2-3) ✓; count pill (Task 4) ✓; rename to "Transaction Logs" (Task 4) ✓; "Clear all logs" / dismiss errors #63 (Tasks 4-5) ✓; testing within node-only Jest (Task 2) ✓.
- **Type consistency:** `weapon_name` / `weapon_icon` / `error_detail` used identically in the type (Task 1), `makeResult` (Task 2), route enrichment (Task 3), and component (Task 4). `getWeaponDefinition` returns `WeaponDefinition | null`; `getWeaponDefinitions` returns `Map<number, WeaponDefinition>` — both have `.name` and `.icon`.
- **No placeholders:** every code step shows full code; every run step states expected output.
```
