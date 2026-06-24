# Bug Fix: All Rolls of Weapons Not Showing

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure all weapon rolls a player owns are displayed in the Current Loadout component, including rolls of re-released weapons from different expansions.

**Architecture:** When the same weapon (by name/archetype) is re-released across expansions, it can have different `itemHash` values in the Bungie API. Currently, perk instances are only collected for weapons in the shared intersection. We'll modify the intersection endpoint's Phase 8 to collect perk data for ALL weapons the player owns, not just intersection weapons.

**Tech Stack:** TypeScript, Bungie API, weapon definition lookups

---

## Understanding the Bug

### Problem
In the Lobby's "Current Loadout" component, not all weapon rolls a player owns are displayed. When a weapon like "Rose" is re-released with a different expansion, it gets a different `itemHash`. If a player owns both variants, only one version's rolls appear.

### Root Cause
In `/app/api/roulette/intersection/route.ts`, Phase 8 (lines 397-468) builds `instancePerks` (perk listings for weapons) by:
1. Filtering to only weapons in the **shared intersection** (`myIntersectionWeapons`)
2. Building perk data keyed by `itemHash`

**Problem:** If a re-released weapon has a different hash than what's in the intersection, its rolls won't appear in `instancePerks`. The LoadoutQueue component then has no data to display for those rolls.

### Affected Code Paths
- **Weapon fetch:** `/lib/bungie/inventory.ts:getWeapons()` — correctly fetches all weapon instances
- **Intersection build:** `/app/api/roulette/intersection/route.ts:Phase 8` — perk data collection (lines 397-468)
- **Lobby display:** `/components/LoadoutQueue.tsx` — renders current loadout from `weaponDetails` and `instancePerks`

---

## File Structure

**No new files required.** Minimal changes to one file:

- **Modify:** `/app/api/roulette/intersection/route.ts` — Phase 8 perk collection logic (lines 397-400)

---

## Implementation Tasks

### Task 1: Understand the Current Phase 8 Logic

**Files:**
- Reference: `/app/api/roulette/intersection/route.ts:394-468`

- [ ] **Step 1: Read Phase 8 to understand current behavior**

Run: `sed -n '394,468p' app/api/roulette/intersection/route.ts`

Expected: See the current intersection-only perk collection.

- [ ] **Step 2: Identify the filtering issue**

Look at line 397-399. Currently:
```typescript
const myIntersectionWeapons = myWeapons.filter((w) =>
  allIntersectionHashSet.has(w.itemHash)
);
```

This filters to only weapons in `allIntersectionHashSet`. The fix is to use **all** weapons.

---

### Task 2: Modify Phase 8 to Collect All Player Weapons

**Files:**
- Modify: `/app/api/roulette/intersection/route.ts:397-400`

- [ ] **Step 1: Change the filter to include all weapons**

In `/app/api/roulette/intersection/route.ts`, replace lines 397-399:

Current:
```typescript
const myIntersectionWeapons = myWeapons.filter((w) =>
  allIntersectionHashSet.has(w.itemHash)
);
```

New:
```typescript
// Include ALL weapons the player owns, not just intersection.
// This ensures we capture perk data for re-released weapons.
const myAllWeapons = myWeapons;
```

- [ ] **Step 2: Update the loop variable for clarity**

Replace line 441:
```typescript
for (const weapon of myIntersectionWeapons) {
```

With:
```typescript
for (const weapon of myAllWeapons) {
```

- [ ] **Step 3: Verify the change is consistent**

Ensure the loop still:
- Reads `myData.sockets.get(weapon.itemInstanceId)` (line 442) ✓
- Keys `instancePerks` by `weapon.itemHash.toString()` (line 448) ✓
- Returns the same data structure (lines 455-466) ✓

No other changes needed — the data structure remains identical.

- [ ] **Step 4: Run TypeScript check**

```bash
npm run type-check
```

Expected: No errors.

- [ ] **Step 5: Run tests**

```bash
npm test -- lib/bungie/__tests__
```

Expected: All tests pass (existing tests shouldn't break).

- [ ] **Step 6: Commit**

```bash
git add app/api/roulette/intersection/route.ts
git commit -m "fix: include all player weapons when collecting perk instances, not just intersection

Ensures that when a weapon is re-released with a different hash,
all rolls the player owns are included in instancePerks data, so
they all display in the current loadout and roll picker.

Previously, rolls outside the shared intersection were skipped.

Closes #68"
```

---

### Task 3: Verification & Testing

**Files:**
- Test: Manual verification in the app

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Create or join a lobby**

Log in and create/join a gun roulette lobby.

- [ ] **Step 3: Manually test with a re-released weapon**

If available (you may need a test account with multiple weapon rolls):
1. Select a character with multiple rolls of the same weapon from different expansions
2. In the "Current Loadout" section, verify the weapon displays
3. In the roll picker (if there are multiple rolls), verify **all rolls** appear
4. Verify no errors in browser console or server logs

- [ ] **Step 4: Test regression scenarios**

- Verify the weapon browser still filters/searches correctly
- Verify the intersection calculation for shared weapons is unchanged
- Verify equipped items display correctly
- Verify vault items display correctly

- [ ] **Step 5: Create a test verification commit (if manual testing confirms success)**

```bash
git commit --allow-empty -m "test: verified all weapon rolls display for re-released weapons

Tested with a character owning multiple Rose rolls from different
expansions. All rolls now appear in current loadout picker.

Issue: Player could not see all Rose rolls from recent expansion.
Result: All rolls now visible in LoadoutQueue component."
```

---

## Edge Cases & Considerations

1. **Performance:** We're now building `instancePerks` for all player weapons instead of just intersection weapons. Since Phase 8 is caller-only (only the calling player's sockets are processed, see line 84), this adds minimal overhead.

2. **Intersection still accurate:** The intersection calculation (Phases 3-4) is unchanged. Only the perk collection now includes non-intersection weapons. This is correct—weapons outside intersection won't be picked by the roulette, but the player's own rolls still display.

3. **Collection weapons:** Phase 5 (exotic collection expansion) continues to work. It expands the intersection; our change only affects per-player perk data.

4. **Non-owned weapons:** We only process weapons from `myWeapons` (fetched from player's actual inventory), so no extraneous data is added.

5. **Vault vs. character:** Already handled—code distinguishes by `location: "vault"` vs. `"character"`. No change needed.

---

## Testing Checklist

- [ ] TypeScript compilation succeeds (`npm run type-check`)
- [ ] Existing tests pass (`npm test`)
- [ ] Dev server starts (`npm run dev`)
- [ ] Manual test: Lobby creation works
- [ ] Manual test: Current Loadout displays weapons
- [ ] Manual test: Roll picker shows all rolls (if multiple exist)
- [ ] Manual test: Weapon browser filtering works
- [ ] Manual test: No console errors

---

## Success Criteria

✓ A player with multiple rolls of the same re-released weapon sees **all rolls** in the Current Loadout picker.
✓ The LoadoutQueue component displays all weapon instances correctly.
✓ No regressions in the intersection or weapon selection logic.
✓ All existing tests pass.
✓ TypeScript compilation succeeds.
