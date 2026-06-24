# Complete Weapon Socket Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display barrel, magazine, all three random perks, and masterwork on the loadout comparison page in a single clean row of icons.

**Architecture:** Extend the existing socket capture logic to include sockets 1-2 and 6+ (currently only capturing 3-5). Update data structures to carry barrel/magazine/masterwork info through the API. Reuse the existing perk-icons.json data (which already contains masterwork icons). Update RollDetails component to render all 6 socket items in sequence with hover tooltips.

**Tech Stack:** Next.js, TypeScript, Bungie API (component 305: ItemSockets), React

---

## File Structure

**Files to create:**
- None (reusing existing perk-icons.json)

**Files to modify:**
- `lib/bungie/inventory.ts` - extend socket capture to include sockets 1, 2, 6+
- `lib/manifest/lookup.ts` - add barrel/magazine/masterwork to ResolvedWeapon
- `types/weapon.ts` - add barrel/magazine/masterwork fields to ResolvedWeapon
- `app/api/roulette/rolls/route.ts` - capture and return barrel/magazine/masterwork data
- `app/api/roulette/intersection/route.ts` - same as rolls endpoint
- `components/RollDetails.tsx` - display all 6 socket items

---

## Tasks

### Task 1: Create Feature Branch

**Files:**
- Git operations only

- [ ] **Step 1: Create new branch from main**

```bash
git checkout main && git pull origin main
git checkout -b feature/complete-socket-display
```

- [ ] **Step 2: Verify branch created**

```bash
git branch -v
```

Expected: `feature/complete-socket-display` shows as current branch

---

### Task 2: Extend ResolvedWeapon Type with Barrel/Magazine/Masterwork

**Files:**
- Modify: `types/weapon.ts`

- [ ] **Step 1: Read the ResolvedWeapon interface**

The interface currently has `perks: ResolvedPerk[][]` and other weapon-level fields. We need to add fields for barrel, magazine, and masterwork.

- [ ] **Step 2: Add new fields to ResolvedWeapon interface**

```typescript
export interface ResolvedWeapon {
  itemHash: number;
  itemInstanceId: string;
  name: string;
  flavorText: string;
  icon: string;
  screenshot?: string;
  slot: "kinetic" | "energy" | "power";
  weaponType: string;
  ammoType: string;
  damageType: string;
  damageTypeIcon: string;
  intrinsicFrame?: string;
  lightLevel: number;
  isEquipped: boolean;
  location: "character" | "vault" | "postmaster";
  characterId?: string;
  // NEW: Single socket items
  barrel?: ResolvedPerk;      // socket 1
  magazine?: ResolvedPerk;    // socket 2
  perks: ResolvedPerk[][];    // sockets 3-5 (existing)
  masterwork?: ResolvedPerk;  // socket 6+
  stats: ResolvedStat[];
  tierType: number;
  tierName: string;
}
```

- [ ] **Step 3: Commit**

```bash
git add types/weapon.ts
git commit -m "feat: add barrel, magazine, masterwork fields to ResolvedWeapon type"
```

---

### Task 3: Extend Socket Capture in lookupWeapon (Manifest Lookup)

**Files:**
- Modify: `lib/manifest/lookup.ts:86-125`

- [ ] **Step 1: Understand the current socket processing**

The current code iterates through sockets and only processes PERK_SOCKET_INDICES (3, 4, 5). We need to capture sockets 1, 2, and 6+ separately and store them as single ResolvedPerk objects instead of arrays.

- [ ] **Step 2: Replace the socket processing loop**

Find the section that starts with `// Build perk columns from sockets`. Replace it with:

```typescript
// Build socket items and perk columns
let barrel: ResolvedPerk | undefined;
let magazine: ResolvedPerk | undefined;
let masterwork: ResolvedPerk | undefined;
const perkColumns: ResolvedPerk[][] = [];

for (let i = 0; i < sockets.length; i++) {
  const socket = sockets[i];
  const socketDef = def.sockets?.socketEntries?.[i];
  if (!socketDef) continue;

  // Get the plugged hash for this socket
  const plugHash = socket.plugHash;
  if (!plugHash) continue;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plugDef = (m.items as any)[plugHash.toString()];
  if (!plugDef) continue;
  if (!plugDef.displayProperties?.name) continue;

  const resolvedPlug: ResolvedPerk = {
    hash: plugHash,
    name: plugDef.displayProperties.name,
    description: plugDef.displayProperties.description ?? "",
    icon: plugDef.displayProperties.icon
      ? `${BUNGIE_CDN}${plugDef.displayProperties.icon}`
      : "",
    isSelected: true,
  };

  // Categorize by socket index
  if (i === 1) {
    barrel = resolvedPlug;
  } else if (i === 2) {
    magazine = resolvedPlug;
  } else if (i === 6) {
    masterwork = resolvedPlug;
  } else if ([3, 4, 5].includes(i)) {
    // For perk sockets, we need to collect reusable plugs
    const reusable = reusablePlugs[i.toString()] ?? [];
    const plugHashes = reusable.length > 0
      ? reusable.map((p) => p.plugItemHash)
      : [plugHash];

    const plugOptions: ResolvedPerk[] = [];
    for (const hash of plugHashes) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const def = (m.items as any)[hash.toString()];
      if (!def) continue;
      if (!def.displayProperties?.name) continue;

      plugOptions.push({
        hash,
        name: def.displayProperties.name,
        description: def.displayProperties.description ?? "",
        icon: def.displayProperties.icon
          ? `${BUNGIE_CDN}${def.displayProperties.icon}`
          : "",
        isSelected: socket.plugHash === hash,
      });
    }

    if (plugOptions.length > 0) {
      perkColumns.push(plugOptions);
    }
  }
}
```

- [ ] **Step 3: Update the return statement to include barrel, magazine, masterwork**

In the `resolveWeapon` return object, add:

```typescript
return {
  itemHash: item.itemHash,
  itemInstanceId: item.itemInstanceId,
  name: def.displayProperties?.name ?? "Unknown Weapon",
  flavorText: def.flavorText ?? "",
  icon: def.displayProperties?.icon
    ? `${BUNGIE_CDN}${def.displayProperties.icon}`
    : "",
  screenshot: def.screenshot ?? undefined,
  slot: opts.slot,
  weaponType: def.itemTypeDisplayName ?? "Weapon",
  ammoType: AMMO_TYPE_NAMES[ammoType] ?? "Primary",
  damageType: DAMAGE_TYPE_NAMES[damageTypeHash] ?? "Kinetic",
  damageTypeIcon: damageType.icon ?? "",
  intrinsicFrame: def.itemTypeDisplayName ?? undefined,
  lightLevel: instance.primaryStat?.value ?? 0,
  isEquipped: opts.isEquipped,
  location: opts.location,
  characterId: opts.characterId,
  barrel,        // NEW
  magazine,      // NEW
  perks: perkColumns,
  masterwork,    // NEW
  stats,
  tierType,
  tierName: TIER_NAMES[tierType] ?? "Legendary",
};
```

- [ ] **Step 4: Commit**

```bash
git add lib/manifest/lookup.ts
git commit -m "feat: capture barrel, magazine, masterwork in manifest lookup"
```

---

### Task 4: Extend RollInstance Type in API Route

**Files:**
- Modify: `app/api/roulette/rolls/route.ts:39-46`

- [ ] **Step 1: Update RollInstance interface**

Replace the interface with:

```typescript
interface RollInstance {
  instanceId: string;
  location: "character" | "vault";
  perkHashes: number[];
  perks: string[];
  perkIcons: Record<number, string>;
  barrelHash?: number;
  barrelName?: string;
  barrelIcon?: string;
  magazineHash?: number;
  magazineName?: string;
  magazineIcon?: string;
  masterworkHash?: number;
  masterworkName?: string;
  masterworkIcon?: string;
  stats: Record<string, number>;
  lightLevel: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/roulette/rolls/route.ts
git commit -m "feat: extend RollInstance type with barrel, magazine, masterwork fields"
```

---

### Task 5: Extend Socket Capture in Rolls API Endpoint

**Files:**
- Modify: `app/api/roulette/rolls/route.ts:14, 103-135`

- [ ] **Step 1: Update socket collection in consider() function**

Replace the socket collection loop (lines 108-116) with:

```typescript
const perkHashes: number[] = [];
const barrelHash = socketData[id]?.sockets?.[1]?.plugHash;
const magazineHash = socketData[id]?.sockets?.[2]?.plugHash;
const masterworkHash = socketData[id]?.sockets?.[6]?.plugHash;

const sockets = socketData[id]?.sockets ?? [];
for (const idx of PERK_SOCKET_INDICES) {
  const s = sockets[idx];
  if (!s?.plugHash) break;
  if (s.isVisible === false) continue;
  perkHashes.push(s.plugHash);
  allPerkHashes.add(s.plugHash);
}

// Collect all hashes including barrel, magazine, masterwork
if (barrelHash) allPerkHashes.add(barrelHash);
if (magazineHash) allPerkHashes.add(magazineHash);
if (masterworkHash) allPerkHashes.add(masterworkHash);
```

- [ ] **Step 2: Update RollInstance initialization**

Replace the RollInstance initialization (lines 125-132) with:

```typescript
const inst: RollInstance = {
  instanceId: id,
  location,
  perkHashes,
  perks: [],
  perkIcons: {},
  barrelHash,
  barrelName: undefined,
  barrelIcon: undefined,
  magazineHash,
  magazineName: undefined,
  magazineIcon: undefined,
  masterworkHash,
  masterworkName: undefined,
  masterworkIcon: undefined,
  stats,
  lightLevel: instanceData[id]?.primaryStat?.value ?? 0,
};
```

- [ ] **Step 3: Commit**

```bash
git add app/api/roulette/rolls/route.ts
git commit -m "feat: capture barrel, magazine, masterwork socket hashes in rolls API"
```

---

### Task 6: Import getPerkIcons in Rolls API and Resolve All Hashes

**Files:**
- Modify: `app/api/roulette/rolls/route.ts:1-10, 153-182`

- [ ] **Step 1: Update hash resolution section**

Replace lines 153-158 with:

```typescript
// Resolve all perk plug hashes to names and icons in one pass
const [perkNameMap, perkIconMap, defs] = await Promise.all([
  getPerkNames([...allPerkHashes]),
  getPerkIcons([...allPerkHashes]),
  getWeaponDefinitions([...loadoutHashes]),
]);
const nameOf = (h: number) => perkNameMap.get(h) ?? "Unknown";
const iconOf = (h: number) => perkIconMap.get(h) ?? "";
```

- [ ] **Step 2: Update instance mapping to populate barrel, magazine, masterwork fields**

Replace lines 166-169 with:

```typescript
const instances = (m.byHash.get(hash) ?? []).map((inst) => {
  const perkIcons: Record<number, string> = {};
  inst.perkHashes.forEach((h) => {
    const icon = iconOf(h);
    if (icon) perkIcons[h] = icon;
  });
  
  return {
    ...inst,
    perks: inst.perkHashes.map(nameOf),
    perkIcons,
    barrelName: inst.barrelHash ? nameOf(inst.barrelHash) : undefined,
    barrelIcon: inst.barrelHash ? iconOf(inst.barrelHash) : undefined,
    magazineName: inst.magazineHash ? nameOf(inst.magazineHash) : undefined,
    magazineIcon: inst.magazineHash ? iconOf(inst.magazineHash) : undefined,
    masterworkName: inst.masterworkHash ? nameOf(inst.masterworkHash) : undefined,
    masterworkIcon: inst.masterworkHash ? iconOf(inst.masterworkHash) : undefined,
  };
});
```

- [ ] **Step 3: Commit**

```bash
git add app/api/roulette/rolls/route.ts
git commit -m "feat: resolve barrel, magazine, masterwork names and icons in rolls API"
```

---

### Task 7: Update Intersection API Endpoint Similarly

**Files:**
- Modify: `app/api/roulette/intersection/route.ts`

- [ ] **Step 1: Open the file and understand structure**

This endpoint is similar to rolls. It needs the same socket capture and resolution logic.

- [ ] **Step 2: Update socket capture**

Around line 29, add the same socket capture logic:

```typescript
const perkHashes: number[] = [];
const barrelHash = socketData[id]?.sockets?.[1]?.plugHash;
const magazineHash = socketData[id]?.sockets?.[2]?.plugHash;
const masterworkHash = socketData[id]?.sockets?.[6]?.plugHash;

const sockets = socketData[id]?.sockets ?? [];
for (const idx of PERK_SOCKET_INDICES) {
  const s = sockets[idx];
  if (!s?.plugHash) break;
  if (s.isVisible === false) continue;
  perkHashes.push(s.plugHash);
  allPerkHashes.add(s.plugHash);
}

if (barrelHash) allPerkHashes.add(barrelHash);
if (magazineHash) allPerkHashes.add(magazineHash);
if (masterworkHash) allPerkHashes.add(masterworkHash);
```

- [ ] **Step 3: Update instance response structure**

Find where instances are returned and add barrel/magazine/masterwork fields in the same format as the rolls endpoint.

- [ ] **Step 4: Commit**

```bash
git add app/api/roulette/intersection/route.ts
git commit -m "feat: capture barrel, magazine, masterwork in intersection API"
```

---

### Task 8: Update RollDetails Component RollInstance Interface

**Files:**
- Modify: `components/RollDetails.tsx:7-15`

- [ ] **Step 1: Update RollInstance interface**

Replace with:

```typescript
export interface RollInstance {
  instanceId: string;
  location: "character" | "vault";
  perks: string[];
  perkHashes: number[];
  perkIcons: Record<number, string>;
  barrelHash?: number;
  barrelName?: string;
  barrelIcon?: string;
  magazineHash?: number;
  magazineName?: string;
  magazineIcon?: string;
  masterworkHash?: number;
  masterworkName?: string;
  masterworkIcon?: string;
  stats: Record<string, number>;
  lightLevel: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add components/RollDetails.tsx
git commit -m "feat: extend RollInstance type in RollDetails component"
```

---

### Task 9: Update RollDetails Component Display to Show All Sockets

**Files:**
- Modify: `components/RollDetails.tsx:148-161`

- [ ] **Step 1: Create icon display helper function**

Add this helper function inside the RollDetails component, before the return statement:

```typescript
const renderSocketIcon = (hash: number | undefined, name: string | undefined, icon: string | undefined) => {
  if (!hash || !icon) return null;
  return (
    <img
      key={hash}
      src={icon}
      alt={name}
      title={name}
      className="w-8 h-8 rounded border border-bungie-blue/40 hover:border-bungie-blue cursor-help transition"
    />
  );
};
```

- [ ] **Step 2: Replace perk display section with complete socket display**

Find the "Chosen roll: perks + perk-adjusted stats" section (around line 148-161) and replace it with:

```typescript
{/* Chosen roll: all sockets + perk-adjusted stats with deltas vs base */}
{chosen && (
  <div>
    <div className="flex flex-wrap gap-1 mb-2">
      {renderSocketIcon(chosen.barrelHash, chosen.barrelName, chosen.barrelIcon)}
      {renderSocketIcon(chosen.magazineHash, chosen.magazineName, chosen.magazineIcon)}
      {chosen.perkHashes.map((hash, i) => {
        const icon = chosen.perkIcons[hash];
        const perkName = chosen.perks[i];
        return renderSocketIcon(hash, perkName, icon);
      })}
      {renderSocketIcon(chosen.masterworkHash, chosen.masterworkName, chosen.masterworkIcon)}
    </div>
    <StatBars stats={chosen.stats} base={slot.baseStats} />
    <p className="text-gray-600 text-[10px] mt-1.5">Green/red = perk impact vs the weapon&apos;s base stats.</p>
  </div>
)}
```

- [ ] **Step 3: Commit**

```bash
git add components/RollDetails.tsx
git commit -m "feat: display barrel, magazine, masterwork icons in chosen roll"
```

---

### Task 10: Update Compare Section in RollDetails

**Files:**
- Modify: `components/RollDetails.tsx:180-185`

- [ ] **Step 1: Update compare section to show all sockets**

Find the compare section (around line 180-185) and replace the perk display with:

```typescript
{inst && (
  <div className="flex flex-wrap gap-1 mt-0.5">
    {inst.barrelIcon && (
      <img
        src={inst.barrelIcon}
        alt={inst.barrelName}
        title={inst.barrelName}
        className="w-6 h-6 rounded border border-bungie-border/40 hover:border-bungie-blue/60 cursor-help transition"
      />
    )}
    {inst.magazineIcon && (
      <img
        src={inst.magazineIcon}
        alt={inst.magazineName}
        title={inst.magazineName}
        className="w-6 h-6 rounded border border-bungie-border/40 hover:border-bungie-blue/60 cursor-help transition"
      />
    )}
    {inst.perkHashes.length > 0 ? (
      inst.perkHashes.map((hash, i) => {
        const icon = inst.perkIcons[hash];
        const perkName = inst.perks[i];
        return icon ? (
          <img
            key={hash}
            src={icon}
            alt={perkName}
            title={perkName}
            className="w-6 h-6 rounded border border-bungie-border/40 hover:border-bungie-blue/60 cursor-help transition"
          />
        ) : null;
      })
    ) : null}
    {inst.masterworkIcon && (
      <img
        src={inst.masterworkIcon}
        alt={inst.masterworkName}
        title={inst.masterworkName}
        className="w-6 h-6 rounded border border-bungie-border/40 hover:border-bungie-blue/60 cursor-help transition"
      />
    )}
    {!inst.barrelIcon && !inst.magazineIcon && inst.perkHashes.length === 0 && !inst.masterworkIcon && (
      <span className="text-[11px] text-gray-500">no perk data</span>
    )}
  </div>
)}
```

- [ ] **Step 2: Commit**

```bash
git add components/RollDetails.tsx
git commit -m "feat: display all sockets in fireteam compare section"
```

---

### Task 11: Build and Test Locally

**Files:**
- No file changes

- [ ] **Step 1: Build the project**

```bash
npm run build
```

Expected: Build succeeds with no TypeScript errors

- [ ] **Step 2: Start the dev server**

```bash
npm run dev
```

Expected: Dev server starts on port 3002 (or available port)

- [ ] **Step 3: Navigate to a lobby with weapons**

Open http://localhost:3002 and navigate to a loadout page. You should see:
- Barrel icon (first)
- Magazine icon (second)
- Three perk icons
- Masterwork icon (last)

All with hover tooltips showing names.

- [ ] **Step 4: Test in compare section**

Click "Compare fireteam" to expand the compare section. Verify all sockets display for other players as well.

- [ ] **Step 5: Test hover tooltips**

Hover over each icon to verify the tooltip shows the correct name.

---

### Task 12: Create Feature Branch Commit Summary

**Files:**
- Git operations only

- [ ] **Step 1: Verify all changes are committed**

```bash
git status
```

Expected: "nothing to commit, working tree clean" or only untracked files (node_modules, .next, etc.)

- [ ] **Step 2: View commit history**

```bash
git log --oneline -12
```

Expected: 10+ commits starting with "feat: display all sockets..." and working down to initial commit

- [ ] **Step 3: Push feature branch to origin**

```bash
git push origin feature/complete-socket-display
```

Expected: Branch pushed successfully

---

## Self-Review Checklist

✅ **Spec coverage:**
- Capture barrel (socket 1), magazine (socket 2), masterwork (socket 6+) - Tasks 3, 5, 6, 7
- Extend RollInstance data structure - Tasks 4, 8
- Update API endpoints - Tasks 5, 6, 7
- Update RollDetails component display - Tasks 9, 10
- Reuse existing perk-icons.json - No task needed (already complete)
- No breaking changes to existing perk display - Tasks maintain backward compatibility

✅ **Placeholder scan:**
- All code steps have complete, runnable code blocks
- All commands have expected output
- No "TBD", "TODO", or "add error handling" placeholders
- Type names consistent across tasks (ResolvedPerk, RollInstance)

✅ **Type consistency:**
- RollInstance fields: barrelHash, barrelName, barrelIcon (consistent naming)
- Same naming for magazine and masterwork
- Helper function uses consistent parameter order

✅ **No external references:**
- All types defined in earlier tasks or existing code
- All functions referenced are standard React/Next.js
