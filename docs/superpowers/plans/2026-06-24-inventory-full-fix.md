# Bug Fix: All Rolls of Weapons Not Showing

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure all weapon rolls a player owns are displayed in the Current Loadout component, including rolls of re-released weapons from different expansions.

**Architecture:** When the same weapon (by name/archetype) is re-released across expansions, it can have different `itemHash` values in the Bungie API. Currently, perk instances are only collected for weapons in the shared intersection. We'll modify the intersection endpoint's Phase 8 to collect perk data for ALL weapons the player owns, not just intersection weapons.

**Tech Stack:** TypeScript, Bungie API, weapon definition lookups

---

## File Structure

### Modified Files
- **`lib/bungie/equip.ts`** — Add inventory fullness detection and proactive vault logic
- **`app/api/apply/route.ts`** — Call proactive inventory clearing before applyWeapons

### New Files
- **`lib/bungie/__tests__/equip.test.ts`** — Unit tests for inventory detection and vaulting logic

---

## Task 1: Create inventory fullness detection function

**Files:**
- Modify: `lib/bungie/equip.ts:1-95` (add new export)
- Test: `lib/bungie/__tests__/equip.test.ts` (create new)

- [ ] **Step 1: Create test file with failing test for `isInventoryFull`**

Create `lib/bungie/__tests__/equip.test.ts`:

```typescript
import { isInventoryFull } from "../equip";
import type { RawWeapon } from "../rawInventory";

describe("isInventoryFull", () => {
  const mockWeapons = (count: number, location: "character" = "character"): RawWeapon[] => {
    return Array.from({ length: count }, (_, i) => ({
      itemHash: 1000 + i,
      itemInstanceId: `instance-${i}`,
      slot: (["kinetic", "energy", "power"][i % 3]) as any,
      location,
      characterId: "test-char-id",
      isEquipped: false,
      lightLevel: 750,
      tierType: 5,
    }));
  };

  it("returns false when character has fewer than 9 weapons", () => {
    const weapons = mockWeapons(8);
    expect(isInventoryFull("test-char-id", weapons)).toBe(false);
  });

  it("returns true when character has 9 weapons", () => {
    const weapons = mockWeapons(9);
    expect(isInventoryFull("test-char-id", weapons)).toBe(true);
  });

  it("returns true when character has more than 9 weapons", () => {
    const weapons = mockWeapons(10);
    expect(isInventoryFull("test-char-id", weapons)).toBe(true);
  });

  it("ignores weapons not on the character", () => {
    const onCharacter = mockWeapons(5);
    const inVault = mockWeapons(5, "vault");
    const weapons = [...onCharacter, ...inVault];
    expect(isInventoryFull("test-char-id", weapons)).toBe(false);
  });

  it("counts equipped items toward inventory limit", () => {
    const weapons = mockWeapons(9);
    weapons[0].isEquipped = true;
    expect(isInventoryFull("test-char-id", weapons)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- lib/bungie/__tests__/equip.test.ts
```

Expected: Test fails with "isInventoryFull is not exported"

- [ ] **Step 3: Add `isInventoryFull` function to equip.ts**

Add to `lib/bungie/equip.ts` after the imports (after line 5):

```typescript
const INVENTORY_SLOT_LIMIT = 9;

export function isInventoryFull(characterId: string, roster: RawWeapon[]): boolean {
  const characterWeapons = roster.filter(
    (w) => w.location === "character" && w.characterId === characterId
  );
  return characterWeapons.length >= INVENTORY_SLOT_LIMIT;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- lib/bungie/__tests__/equip.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/bungie/equip.ts lib/bungie/__tests__/equip.test.ts
git commit -m "feat: add isInventoryFull detection function

Adds function to check if a character's inventory is at capacity (9 slots).
Used to detect when proactive space-making is needed before equipping.

Closes #61"
```

---

## Task 2: Create function to find and vault lowest-light weapon

**Files:**
- Modify: `lib/bungie/equip.ts:60-100` (add new export)
- Modify: `lib/bungie/__tests__/equip.test.ts` (add tests)

- [ ] **Step 1: Add failing test for `findLowestLightWeapon`**

Add to `lib/bungie/__tests__/equip.test.ts` after the `isInventoryFull` describe block:

```typescript
describe("findLowestLightWeapon", () => {
  const mockWeapons = (
    characterId: string,
    counts: { light: number; count: number }[] = []
  ): RawWeapon[] => {
    let id = 0;
    return counts.flatMap(({ light, count }) =>
      Array.from({ length: count }, () => ({
        itemHash: 1000 + id,
        itemInstanceId: `instance-${id++}`,
        slot: "kinetic" as const,
        location: "character" as const,
        characterId,
        isEquipped: false,
        lightLevel: light,
        tierType: 5,
      }))
    );
  };

  it("returns the weapon with lowest light level", () => {
    const weapons = mockWeapons("char-1", [
      { light: 760, count: 2 },
      { light: 750, count: 1 },
      { light: 770, count: 1 },
    ]);
    const result = findLowestLightWeapon("char-1", weapons);
    expect(result?.lightLevel).toBe(750);
  });

  it("returns null when no weapons available on character", () => {
    const weapons = mockWeapons("char-1", [{ light: 760, count: 0 }]);
    const result = findLowestLightWeapon("char-1", weapons);
    expect(result).toBeNull();
  });

  it("ignores vault weapons", () => {
    const charWeapons = mockWeapons("char-1", [{ light: 750, count: 2 }]);
    const vaultWeapons: RawWeapon[] = [
      {
        itemHash: 2000,
        itemInstanceId: "vault-weapon",
        slot: "kinetic",
        location: "vault",
        isEquipped: false,
        lightLevel: 700,
        tierType: 5,
      },
    ];
    const result = findLowestLightWeapon("char-1", [...charWeapons, ...vaultWeapons]);
    expect(result?.lightLevel).toBe(750);
  });

  it("ignores equipped weapons", () => {
    const weapons = mockWeapons("char-1", [{ light: 750, count: 2 }]);
    weapons[0].isEquipped = true;
    const result = findLowestLightWeapon("char-1", weapons);
    expect(result?.lightLevel).toBe(750);
    expect(result?.itemInstanceId).toBe("instance-1");
  });

  it("returns null when only equipped weapons exist", () => {
    const weapons = mockWeapons("char-1", [{ light: 750, count: 1 }]);
    weapons[0].isEquipped = true;
    const result = findLowestLightWeapon("char-1", weapons);
    expect(result).toBeNull();
  });

  it("excludes specified item instance IDs", () => {
    const weapons = mockWeapons("char-1", [
      { light: 750, count: 1 },
      { light: 740, count: 1 },
    ]);
    const result = findLowestLightWeapon(
      "char-1",
      weapons,
      new Set(["instance-0"])
    );
    expect(result?.lightLevel).toBe(740);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- lib/bungie/__tests__/equip.test.ts
```

Expected: Test fails with "findLowestLightWeapon is not exported"

- [ ] **Step 3: Add `findLowestLightWeapon` function to equip.ts**

Add to `lib/bungie/equip.ts` after `isInventoryFull` (after line 12):

```typescript
export function findLowestLightWeapon(
  characterId: string,
  roster: RawWeapon[],
  excludeInstanceIds: Set<string> = new Set()
): RawWeapon | null {
  const candidates = roster.filter(
    (w) =>
      w.location === "character" &&
      w.characterId === characterId &&
      !w.isEquipped &&
      !excludeInstanceIds.has(w.itemInstanceId)
  );
  return candidates.sort((a, b) => a.lightLevel - b.lightLevel)[0] ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- lib/bungie/__tests__/equip.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/bungie/equip.ts lib/bungie/__tests__/equip.test.ts
git commit -m "feat: add findLowestLightWeapon helper function

Finds the lowest light level weapon on a character, excluding equipped items
and optionally specified instances. Used to select which weapon to vault
when inventory space is needed.

Closes #61"
```

---

## Task 3: Create function to clear inventory before equip

**Files:**
- Modify: `lib/bungie/equip.ts:120-180` (add new export)
- Modify: `lib/bungie/__tests__/equip.test.ts` (add tests)

- [ ] **Step 1: Add failing test for `ensureInventorySpace`**

Add to `lib/bungie/__tests__/equip.test.ts` after the `findLowestLightWeapon` describe block:

```typescript
describe("ensureInventorySpace", () => {
  const mockTransferItem = jest.fn();

  const mockWeapons = (
    characterId: string,
    count: number = 9
  ): RawWeapon[] => {
    return Array.from({ length: count }, (_, i) => ({
      itemHash: 1000 + i,
      itemInstanceId: `instance-${i}`,
      slot: (["kinetic", "energy", "power"][i % 3]) as any,
      location: "character" as const,
      characterId,
      isEquipped: i === 0, // first is equipped
      lightLevel: 750 - i,
      tierType: 5,
    }));
  };

  beforeEach(() => {
    mockTransferItem.mockClear();
  });

  it("returns empty array when inventory is not full", async () => {
    const weapons = mockWeapons("char-1", 8);
    const result = await ensureInventorySpace(
      "char-1",
      "bearer-token",
      1,
      weapons,
      mockTransferItem
    );
    expect(result).toEqual([]);
    expect(mockTransferItem).not.toHaveBeenCalled();
  });

  it("vaults lowest-light weapon when inventory is full", async () => {
    const weapons = mockWeapons("char-1", 9);
    const result = await ensureInventorySpace(
      "char-1",
      "bearer-token",
      1,
      weapons,
      mockTransferItem
    );
    expect(result).toHaveLength(1);
    expect(result[0].itemInstanceId).toBe("instance-8"); // lowest light
    expect(mockTransferItem).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: "instance-8",
        transferToVault: true,
      })
    );
  });

  it("returns successful vaults", async () => {
    const weapons = mockWeapons("char-1", 9);
    mockTransferItem.mockResolvedValue(undefined);
    const result = await ensureInventorySpace(
      "char-1",
      "bearer-token",
      1,
      weapons,
      mockTransferItem
    );
    expect(result).toHaveLength(1);
    expect(result[0].success).toBe(true);
  });

  it("returns failed vaults with error message", async () => {
    const weapons = mockWeapons("char-1", 9);
    const error = new Error("Transfer failed");
    mockTransferItem.mockRejectedValue(error);
    const result = await ensureInventorySpace(
      "char-1",
      "bearer-token",
      1,
      weapons,
      mockTransferItem
    );
    expect(result).toHaveLength(1);
    expect(result[0].success).toBe(false);
    expect(result[0].error).toBe("Transfer failed");
  });

  it("excludes specified item instances from vaulting", async () => {
    const weapons = mockWeapons("char-1", 9);
    const result = await ensureInventorySpace(
      "char-1",
      "bearer-token",
      1,
      weapons,
      mockTransferItem,
      new Set(["instance-8"])
    );
    // Should vault instance-7 (next lowest) since instance-8 is excluded
    expect(result).toHaveLength(1);
    expect(result[0].itemInstanceId).toBe("instance-7");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- lib/bungie/__tests__/equip.test.ts
```

Expected: Test fails with "ensureInventorySpace is not exported"

- [ ] **Step 3: Add `ensureInventorySpace` function to equip.ts**

Add to `lib/bungie/equip.ts` after `findLowestLightWeapon` (after line 27):

```typescript
export interface InventoryClearResult {
  itemInstanceId: string;
  itemHash: number;
  success: boolean;
  error?: string;
}

export async function ensureInventorySpace(
  characterId: string,
  accessToken: string,
  membershipType: number,
  roster: RawWeapon[],
  transferFn?: (req: TransferItemRequest) => Promise<unknown>,
  excludeInstanceIds: Set<string> = new Set()
): Promise<InventoryClearResult[]> {
  const results: InventoryClearResult[] = [];

  if (!isInventoryFull(characterId, roster)) {
    return results;
  }

  const toVault = findLowestLightWeapon(characterId, roster, excludeInstanceIds);
  if (!toVault) {
    return results; // No weapon available to vault
  }

  const transfer = transferFn || ((req) =>
    bungiePost<unknown>("/Destiny2/Actions/Items/TransferItem/", accessToken, req)
  );

  try {
    await transfer({
      itemReferenceHash: toVault.itemHash,
      stackSize: 1,
      transferToVault: true,
      itemId: toVault.itemInstanceId,
      characterId,
      membershipType,
    } satisfies TransferItemRequest);

    results.push({
      itemInstanceId: toVault.itemInstanceId,
      itemHash: toVault.itemHash,
      success: true,
    });
  } catch (err) {
    results.push({
      itemInstanceId: toVault.itemInstanceId,
      itemHash: toVault.itemHash,
      success: false,
      error: err instanceof Error ? err.message : "Failed to vault weapon",
    });
  }

  return results;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- lib/bungie/__tests__/equip.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/bungie/equip.ts lib/bungie/__tests__/equip.test.ts
git commit -m "feat: add ensureInventorySpace proactive vaulting

Detects when inventory is full and proactively vaults the lowest-light
weapon to make room before attempting equipment transfers. Returns results
indicating success/failure of vault operation.

Closes #61"
```

---

## Task 4: Integrate proactive clearing into Apply Loadout endpoint

**Files:**
- Modify: `app/api/apply/route.ts:47-107`

- [ ] **Step 1: Import the new functions**

Modify the imports at the top of `app/api/apply/route.ts` (lines 1-10):

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireSession, getBungieToken } from "@/lib/auth/helpers";
import { adminSupabase } from "@/lib/supabase/admin";
import { getRawWeapons, type RawWeapon } from "@/lib/bungie/rawInventory";
import { applyWeapons, ensureInventorySpace, type InventoryClearResult } from "@/lib/bungie/equip";
import type { WeaponToApply } from "@/lib/bungie/equip";
import type { ApplyResult } from "@/types/lobby";
import type { WeaponSlot } from "@/types/bungie";
import { rotateCaptain } from "@/lib/lobby";
import { z } from "zod";
```

- [ ] **Step 2: Call ensureInventorySpace before applyWeapons**

Modify the POST handler in `app/api/apply/route.ts` (around line 99, after getting myWeapons and before calling applyWeapons):

Replace this:
```typescript
    const equipResults = await applyWeapons(
      weaponsToApply,
      body.characterId,
      session.bungieMembershipType,
      token,
      session.userId,
      session.displayName,
      myWeapons
    );

    const results = [...equipResults, ...missing];
```

With this:
```typescript
    // Proactively ensure inventory has space for incoming weapons
    const clearResults = await ensureInventorySpace(
      body.characterId,
      token,
      session.bungieMembershipType,
      myWeapons
    );

    // Update roster after vaulting to reflect space made
    const rosterAfterClearing = myWeapons.filter(
      (w) => !clearResults.find((r) => r.itemInstanceId === w.itemInstanceId)
    );

    const equipResults = await applyWeapons(
      weaponsToApply,
      body.characterId,
      session.bungieMembershipType,
      token,
      session.userId,
      session.displayName,
      rosterAfterClearing
    );

    const results = [
      ...clearResults.map((r) => ({
        user_id: session.userId,
        display_name: session.displayName,
        slot: "kinetic" as WeaponSlot, // vault operations don't have a specific slot
        item_hash: r.itemHash,
        success: r.success,
        error: r.error ? `Vaulted to make room: ${r.error}` : undefined,
      })),
      ...equipResults,
      ...missing,
    ];
```

- [ ] **Step 3: Verify TypeScript compilation**

```bash
npm run build
```

Expected: Build succeeds with no TypeScript errors

- [ ] **Step 4: Test the integration manually (if you have the dev env)**

Run your dev server and test applying a loadout with a full inventory (optional at this stage).

- [ ] **Step 5: Commit**

```bash
git add app/api/apply/route.ts
git commit -m "feat: call proactive inventory clearing before equipping

Calls ensureInventorySpace before applyWeapons to detect and handle
full inventory. Updates roster after vaulting so applyWeapons has
accurate space information. Returns results of vault operations.

Closes #61"
```

---

## Task 5: Handle excluded instances to avoid vaulting loadout items

**Files:**
- Modify: `app/api/apply/route.ts:99-135` (enhance exclude logic)
- Modify: `lib/bungie/__tests__/equip.test.ts` (add integration test)

- [ ] **Step 1: Update ensureInventorySpace call to exclude loadout items**

Modify the `clearResults` call in `app/api/apply/route.ts` (around line 99):

Replace:
```typescript
    const clearResults = await ensureInventorySpace(
      body.characterId,
      token,
      session.bungieMembershipType,
      myWeapons
    );
```

With:
```typescript
    // Build set of instance IDs we're about to equip - don't vault these!
    const loadoutInstanceIds = new Set(weaponsToApply.map((w) => w.itemInstanceId));

    const clearResults = await ensureInventorySpace(
      body.characterId,
      token,
      session.bungieMembershipType,
      myWeapons,
      undefined,
      loadoutInstanceIds
    );
```

- [ ] **Step 2: Run tests to verify nothing broke**

```bash
npm run build
npm test -- lib/bungie/__tests__/equip.test.ts
```

Expected: Build succeeds, tests pass

- [ ] **Step 3: Add integration test for the exclude logic**

Add to `lib/bungie/__tests__/equip.test.ts` in the `ensureInventorySpace` describe block:

```typescript
  it("does not vault weapons that are part of the loadout being equipped", async () => {
    const weapons = mockWeapons("char-1", 9);
    const loadoutIds = new Set(["instance-8"]); // lowest light item
    mockTransferItem.mockResolvedValue(undefined);
    const result = await ensureInventorySpace(
      "char-1",
      "bearer-token",
      1,
      weapons,
      mockTransferItem,
      loadoutIds
    );
    // Should vault instance-7 (next lowest) instead
    expect(result).toHaveLength(1);
    expect(result[0].itemInstanceId).toBe("instance-7");
  });
```

- [ ] **Step 4: Run updated test**

```bash
npm test -- lib/bungie/__tests__/equip.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/apply/route.ts lib/bungie/__tests__/equip.test.ts
git commit -m "feat: exclude loadout items from proactive vaulting

Prevent ensureInventorySpace from vaulting any weapons that are part
of the loadout being equipped. This ensures we never vault the exact
weapons the user is trying to equip.

Closes #61"
```

---

## Task 6: Add error handling for vault failures

**Files:**
- Modify: `lib/bungie/equip.ts:50-85` (enhance ensureInventorySpace)
- Modify: `lib/bungie/__tests__/equip.test.ts` (add failure tests)

- [ ] **Step 1: Add test for handling vault failures gracefully**

Add to the `ensureInventorySpace` describe block:

```typescript
  it("returns error results without throwing when vault fails", async () => {
    const weapons = mockWeapons("char-1", 9);
    mockTransferItem.mockRejectedValue(new Error("Bungie API error"));
    const result = await ensureInventorySpace(
      "char-1",
      "bearer-token",
      1,
      weapons,
      mockTransferItem
    );
    expect(result).toHaveLength(1);
    expect(result[0].success).toBe(false);
    expect(result[0].error).toContain("Bungie API error");
  });
```

- [ ] **Step 2: Run test to verify it passes**

```bash
npm test -- lib/bungie/__tests__/equip.test.ts
```

Expected: PASS (test should already pass based on current implementation)

- [ ] **Step 3: Verify applyWeapons gracefully handles the case where preemptive vaulting fails**

The current implementation of `applyWeapons` already has retry logic in the `makeRoom` function (lines 282-289 in equip.ts). It will attempt to vault another weapon if the first transfer fails. This is good defensive programming.

- [ ] **Step 4: Document the failure behavior in code**

Add a comment in `app/api/apply/route.ts` above the ensureInventorySpace call:

```typescript
    // Proactively ensure inventory has space for incoming weapons.
    // If this fails, applyWeapons still has fallback retry logic to vault additional items.
    const clearResults = await ensureInventorySpace(
      body.characterId,
      token,
      session.bungieMembershipType,
      myWeapons,
      undefined,
      loadoutInstanceIds
    );
```

- [ ] **Step 5: Commit**

```bash
git add lib/bungie/equip.ts app/api/apply/route.ts lib/bungie/__tests__/equip.test.ts
git commit -m "docs: clarify vault failure handling in inventory clearing

Added documentation explaining that vault failures in ensureInventorySpace
are non-fatal - applyWeapons still has fallback retry logic if preemptive
vaulting didn't free enough space.

Closes #61"
```

---

## Task 7: Integration testing with the full apply workflow

**Files:**
- Test manually or add integration tests if test infrastructure exists

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```

Expected: All tests pass

- [ ] **Step 2: Build the project**

```bash
npm run build
```

Expected: Build succeeds with no TypeScript errors

- [ ] **Step 3: Test the feature (manual or integration test)**

If you have a dev environment set up:
- Start the server: `npm run dev`
- Go to the app, create a loadout, and try to apply it with a full inventory
- Verify that an item is vaulted and the loadout is applied successfully
- Check browser console and server logs for any errors

Or if test infrastructure is available, create an integration test that mocks Bungie API calls and verifies the full flow.

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "test: add integration testing for full apply workflow with full inventory

Closes #61"
```

---

## Success Criteria Verification

- ✅ `isInventoryFull()` correctly identifies when inventory is at 9/9 capacity
- ✅ `findLowestLightWeapon()` finds the correct weapon to vault
- ✅ `ensureInventorySpace()` proactively vaults items without throwing
- ✅ `applyWeapons()` receives updated roster after preemptive vaulting
- ✅ Loadout items are never vaulted even if they're lowest-light
- ✅ Vault failures in ensureInventorySpace don't block the equip attempt
- ✅ Full test coverage for new functions
- ✅ TypeScript compilation succeeds
- ✅ Users can equip loadouts with full inventory

---

## Architecture Notes

**Why this approach:**
1. **Proactive over reactive** — Clear space BEFORE attempting transfers, reducing API calls and edge cases
2. **Consistent** — Always vault lowest-light spare, giving predictable behavior
3. **Non-blocking** — If proactive clearing fails, applyWeapons retry logic kicks in
4. **Minimal** — Move only what's necessary (one weapon max) to minimize user disruption
5. **Safe** — Exclude loadout items from vaulting to ensure we don't vault what we're trying to equip

**Edge cases covered:**
- Inventory not full → no vaulting needed
- No spare weapons available → applyWeapons handles it with fallback logic
- Vault operation fails → error reported but doesn't block equip attempt
- Equipped items excluded from vaulting
- Loadout items excluded from vaulting even if lowest-light
