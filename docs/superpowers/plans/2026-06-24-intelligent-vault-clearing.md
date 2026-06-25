# Issue #61: Intelligent Inventory Clearing for Loadout Application

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task with review between tasks.

**Goal:** Fix Bungie API 500 errors when applying loadouts with full inventory by intelligently vaulting only the minimum weapons needed, avoiding edge cases where inventory depletes.

**Architecture:**
Instead of vaulting a fixed number of weapons (like 3), vault intelligently based on actual need:
- Calculate how much space is required for the incoming loadout
- Vault only the lowest-light weapons needed to create that space
- Keep a safety threshold (never vault more than 50% of unequipped weapons)
- Skip vaulting if inventory already has enough space

**Tech Stack:** TypeScript, Bungie API, Jest tests

---

## File Structure

**Files to modify:**
- `lib/bungie/equip.ts` — Core vaulting logic with intelligent space calculation
- `app/api/apply/route.ts` — Pass loadout size to ensureInventorySpace
- `lib/bungie/__tests__/equip.test.ts` — Update/add tests for intelligent vaulting

**Changes needed:**
- Add `findLowestLightWeapons` helper (returns multiple weapons by light level)
- Refactor `ensureInventorySpace` to calculate needed space and vault only that much
- Improve `makeRoom` in `applyWeapons` to search globally for lowest-light weapons
- Add safety thresholds and edge-case handling

---

## Task 1: Add `findLowestLightWeapons` Helper ✅ COMPLETE

**Status:** Already implemented in commit `03569be`

Function added to find multiple lowest-light unequipped weapons globally (not per-slot).

---

## Task 2: Create `calculateVaultNeeded` Helper Function

**Files:**
- Modify: `lib/bungie/equip.ts` (add after findLowestLightWeapons)
- Test: `lib/bungie/__tests__/equip.test.ts` (add tests)

**Purpose:** Intelligently calculate how many weapons need to be vaulted based on loadout size and current inventory.

- [ ] **Step 1: Add failing test for `calculateVaultNeeded`**

Add to `lib/bungie/__tests__/equip.test.ts` at the end:

```typescript
describe("calculateVaultNeeded", () => {
  const mockWeapons = (charCount: number, equipped: number = 3): RawWeapon[] => {
    const allWeapons: RawWeapon[] = [];
    for (let i = 0; i < charCount; i++) {
      allWeapons.push({
        itemHash: 1000 + i,
        itemInstanceId: `instance-${i}`,
        slot: (["kinetic", "energy", "power"][i % 3]) as any,
        location: "character",
        characterId: "char-1",
        isEquipped: i < equipped,
        lightLevel: 750 - i,
        tierType: 5,
      });
    }
    return allWeapons;
  };

  it("returns 0 when inventory has space", () => {
    const weapons = mockWeapons(8, 3); // 8 total, 3 equipped, 5 unequipped
    const needed = calculateVaultNeeded("char-1", weapons, 3); // loadout has 3 weapons
    expect(needed).toBe(0); // 5 unequipped >= 3 needed
  });

  it("returns needed count when inventory is full", () => {
    const weapons = mockWeapons(9, 3); // 9 total, 3 equipped, 6 unequipped
    const needed = calculateVaultNeeded("char-1", weapons, 6); // loadout has 6 weapons (all coming in)
    expect(needed).toBe(3); // need to vault 3 to free 3 slots (9 - 3 = 6 total, need 3 more)
  });

  it("respects safety threshold (never vault more than 50% of unequipped)", () => {
    const weapons = mockWeapons(9, 3); // 9 total, 3 equipped, 6 unequipped
    const needed = calculateVaultNeeded("char-1", weapons, 8); // loadout wants 8 weapons
    // Would need to vault 5 (9 + 8 - 9 = 8), but cap at 50% of unequipped (6 * 0.5 = 3)
    expect(needed).toBe(3);
  });

  it("returns 0 when loadout has weapons already on character", () => {
    const weapons = mockWeapons(9, 3);
    // If 3 of 6 loadout weapons are already on character, only 3 are incoming
    const needed = calculateVaultNeeded("char-1", weapons, 3, new Set(["instance-0", "instance-1", "instance-2"]));
    expect(needed).toBe(0); // 6 unequipped >= 3 incoming
  });

  it("returns 0 when no weapons to vault available", () => {
    const weapons = mockWeapons(9, 9); // All equipped
    const needed = calculateVaultNeeded("char-1", weapons, 3);
    expect(needed).toBe(0); // Can't vault equipped weapons
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- lib/bungie/__tests__/equip.test.ts
```

Expected: Test fails with "calculateVaultNeeded is not exported"

- [ ] **Step 3: Implement `calculateVaultNeeded` function**

Add to `lib/bungie/equip.ts` after `findLowestLightWeapons`:

```typescript
const SAFETY_VAULT_THRESHOLD = 0.5; // Never vault more than 50% of unequipped weapons

export function calculateVaultNeeded(
  characterId: string,
  roster: RawWeapon[],
  incomingWeaponCount: number,
  alreadyOnCharacter: Set<string> = new Set()
): number {
  const characterWeapons = roster.filter(
    (w) => w.location === "character" && w.characterId === characterId
  );

  const unequippedWeapons = characterWeapons.filter((w) => !w.isEquipped);
  const equippedWeapons = characterWeapons.filter((w) => w.isEquipped);

  // How many of the incoming weapons are already on this character?
  const incomingOnCharacter = roster.filter(
    (w) =>
      w.location === "character" &&
      w.characterId === characterId &&
      alreadyOnCharacter.has(w.itemInstanceId)
  ).length;

  // How many new weapons are coming from outside?
  const incomingFromOutside = incomingWeaponCount - incomingOnCharacter;

  if (incomingFromOutside <= 0) return 0;

  // Current capacity: equipped + unequipped
  // After adding incoming: equipped + unequipped + incoming
  // Max allowed: 9
  // So we need to vault: (equipped + unequipped + incoming) - 9
  const currentTotal = equippedWeapons.length + unequippedWeapons.length;
  const afterAdding = currentTotal + incomingFromOutside;
  const basicNeed = Math.max(0, afterAdding - INVENTORY_SLOT_LIMIT);

  // Apply safety threshold: never vault more than 50% of unequipped
  const maxSafeVault = Math.floor(unequippedWeapons.length * SAFETY_VAULT_THRESHOLD);
  const capped = Math.min(basicNeed, maxSafeVault);

  return Math.max(0, capped);
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
git commit -m "feat: add calculateVaultNeeded for intelligent space calculation

- Calculates exact weapons needed to vault based on loadout size
- Respects safety threshold: never vault >50% of unequipped weapons
- Accounts for weapons already on character
- Reduces unnecessary vaulting

Closes #61"
```

---

## Task 3: Refactor `ensureInventorySpace` to Use Intelligent Vaulting

**Files:**
- Modify: `lib/bungie/equip.ts:91-147` (replace entire function)
- Modify: `app/api/apply/route.ts:112-119` (pass loadout count)
- Modify: `lib/bungie/__tests__/equip.test.ts` (update existing tests)

**Purpose:** Use the new intelligent calculation to vault only what's needed.

- [ ] **Step 1: Update `ensureInventorySpace` signature to accept loadout count**

Replace the function signature (line 91-98) with:

```typescript
export async function ensureInventorySpace(
  characterId: string,
  accessToken: string,
  membershipType: number,
  roster: RawWeapon[],
  incomingWeaponCount: number = 0,
  loadoutInstanceIds: Set<string> = new Set()
): Promise<InventoryClearResult[]> {
```

- [ ] **Step 2: Implement intelligent vaulting logic**

Replace the function body (lines 99-147) with:

```typescript
  const results: InventoryClearResult[] = [];

  // Determine how many weapons actually need to be vaulted
  const vaultNeeded = calculateVaultNeeded(
    characterId,
    roster,
    incomingWeaponCount,
    loadoutInstanceIds
  );

  if (vaultNeeded === 0) {
    return results; // No vaulting needed
  }

  // Find the lowest-light weapons to vault
  const weaponsToVault = findLowestLightWeapons(
    characterId,
    roster,
    vaultNeeded,
    loadoutInstanceIds
  );

  if (weaponsToVault.length === 0) {
    // No unequipped weapons available to vault - this shouldn't happen with safety threshold
    // but if it does, just return empty and let applyWeapons handle it with fallback logic
    return results;
  }

  // Vault each weapon in sequence, continue even if one fails
  for (const weapon of weaponsToVault) {
    try {
      await bungiePost<unknown>(
        "/Destiny2/Actions/Items/TransferItem/",
        accessToken,
        {
          itemReferenceHash: weapon.itemHash,
          stackSize: 1,
          transferToVault: true,
          itemId: weapon.itemInstanceId,
          characterId,
          membershipType,
        } satisfies TransferItemRequest
      );

      results.push({
        itemInstanceId: weapon.itemInstanceId,
        itemHash: weapon.itemHash,
        transferredToVault: true,
        success: true,
      });
    } catch (err) {
      // If a vault fails, note it but continue trying others
      results.push({
        itemInstanceId: weapon.itemInstanceId,
        itemHash: weapon.itemHash,
        transferredToVault: false,
        success: false,
        error: err instanceof Error ? err.message : "Failed to vault weapon",
      });
      // Continue trying to vault remaining weapons
    }
  }

  return results;
}
```

- [ ] **Step 3: Update apply route to pass loadout count**

Modify `app/api/apply/route.ts` at line 112. Change from:

```typescript
    const clearResults = await ensureInventorySpace(
      body.characterId,
      token,
      session.bungieMembershipType,
      myWeapons,
      undefined,
      loadoutInstanceIds
    );
```

To:

```typescript
    const clearResults = await ensureInventorySpace(
      body.characterId,
      token,
      session.bungieMembershipType,
      myWeapons,
      weaponsToApply.length, // Pass actual loadout size for intelligent calculation
      loadoutInstanceIds
    );
```

- [ ] **Step 4: Update tests to match new signature**

Update the test setup in `lib/bungie/__tests__/equip.test.ts`. Find the `ensureInventorySpace` describe block and update calls to include the new parameter. For example, change:

```typescript
const result = await ensureInventorySpace("char-1", "token", 2, weapons);
```

To:

```typescript
const result = await ensureInventorySpace("char-1", "token", 2, weapons, 3); // 3 = loadout size
```

(Check each test call and add appropriate loadout count based on test scenario)

- [ ] **Step 5: Run all tests**

```bash
npm test -- lib/bungie/__tests__/equip.test.ts
npm run build
```

Expected: All tests pass, TypeScript compilation succeeds

- [ ] **Step 6: Commit**

```bash
git add lib/bungie/equip.ts app/api/apply/route.ts lib/bungie/__tests__/equip.test.ts
git commit -m "refactor: ensureInventorySpace uses intelligent need-based vaulting

- Uses calculateVaultNeeded to vault only what's necessary
- Vaults multiple lowest-light weapons if needed
- Respects safety threshold to avoid over-vaulting
- Passes loadout size from apply route for accurate calculation

Closes #61"
```

---

## Task 4: Improve `makeRoom` in `applyWeapons` to Search Globally

**Files:**
- Modify: `lib/bungie/equip.ts:234-264` (improve makeRoom nested function)

**Purpose:** When a specific slot is full of equipped weapons, vault any lowest-light unequipped weapon globally instead of failing.

- [ ] **Step 1: Read the current `makeRoom` function**

Located in `applyWeapons` function (around lines 234-264). It currently only searches in the target slot.

- [ ] **Step 2: Update `makeRoom` to search globally as fallback**

Replace the `makeRoom` function with:

```typescript
async function makeRoom(slot: WeaponSlot): Promise<boolean> {
  // First, try to find an unequipped weapon in the target slot
  let candidates = roster.filter(
    (w) =>
      w.slot === slot &&
      w.location === "character" &&
      w.characterId === targetCharacterId &&
      !w.isEquipped &&
      !loadoutInstanceIds.has(w.itemInstanceId) &&
      !movedToVault.has(w.itemInstanceId)
  );

  let candidate = candidates.sort((a, b) => a.lightLevel - b.lightLevel)[0] ?? null;

  // If no unequipped weapon in slot, search globally for lowest-light unequipped weapon
  if (!candidate) {
    candidates = roster.filter(
      (w) =>
        w.location === "character" &&
        w.characterId === targetCharacterId &&
        !w.isEquipped &&
        !loadoutInstanceIds.has(w.itemInstanceId) &&
        !movedToVault.has(w.itemInstanceId)
    );
    candidate = candidates.sort((a, b) => a.lightLevel - b.lightLevel)[0] ?? null;
  }

  if (!candidate) return false;

  try {
    await bungiePost<unknown>(
      "/Destiny2/Actions/Items/TransferItem/",
      accessToken,
      {
        itemReferenceHash: candidate.itemHash,
        stackSize: 1,
        transferToVault: true,
        itemId: candidate.itemInstanceId,
        characterId: targetCharacterId,
        membershipType,
      } satisfies TransferItemRequest
    );
    movedToVault.add(candidate.itemInstanceId);
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 3: Run tests**

```bash
npm test -- lib/bungie/__tests__/equip.test.ts
```

Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add lib/bungie/equip.ts
git commit -m "refactor: makeRoom searches globally for lowest-light weapon

- First tries to find unequipped weapon in target slot (original behavior)
- If none found, vaults lowest-light unequipped weapon globally
- Prevents 'no room' errors when a slot is full of equipped weapons

Closes #61"
```

---

## Task 5: Verify Edge Cases and Run Full Test Suite

**Purpose:** Ensure the intelligent vaulting handles all edge cases properly.

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

Expected: All tests pass

- [ ] **Step 2: Build the project**

```bash
npm run build
```

Expected: No TypeScript errors

- [ ] **Step 3: Manual edge case verification**

Verify the logic handles:
- ✓ Inventory not full → no vaulting
- ✓ Inventory full, small loadout → vault minimal weapons
- ✓ Inventory full, large loadout → vault needed amount (up to safety threshold)
- ✓ Repeated applications → never over-vault, keep safety threshold
- ✓ All weapons equipped → no vaulting possible (fallback to makeRoom)
- ✓ Weapons already on character → don't count as incoming

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "test: verify intelligent vaulting edge cases

- Full test suite passes
- TypeScript compilation clean
- All edge cases handled correctly

Closes #61"
```

---

## Summary of Intelligence Features

| Scenario | Old Behavior | New Behavior |
|----------|--------------|--------------|
| Inventory has 7 weapons, loadout is 2 | Vault 1 | Vault 0 (has space) |
| Inventory full (9), loadout is 3 | Vault 1 | Vault 3 (if unequipped available) |
| Inventory full (9), loadout is 8 | Vault 1 | Vault 3 max (safety threshold) |
| Repeated applications | Eventually depletes | Respects safety threshold |
| Mix of equipped/unequipped | Only considers last | Considers all, picks lowest-light |

---

## Success Criteria

- ✅ `calculateVaultNeeded` correctly determines space needed
- ✅ `ensureInventorySpace` vaults only the minimum required
- ✅ Safety threshold prevents over-vaulting (never >50% unequipped)
- ✅ `makeRoom` searches globally for lowest-light weapon
- ✅ Edge cases handled: full inventory, repeated applications, mixed equipped/unequipped
- ✅ All tests pass, TypeScript builds clean
- ✅ Users can apply loadouts without inventory errors
- ✅ Users keep reasonable number of weapons in inventory
