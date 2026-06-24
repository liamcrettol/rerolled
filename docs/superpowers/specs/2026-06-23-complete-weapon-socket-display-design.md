# Complete Weapon Socket Display Design

**Date:** 2026-06-23  
**Feature:** Display all weapon sockets (barrel, magazine, perks, masterwork) on loadout page

## Overview

Extend the loadout comparison page to display the complete weapon socket configuration: barrel, magazine, all three random perks, and masterwork. Display as a single clean row of icons with hover tooltips showing names.

## Current State

- **RollDetails component** displays only 3 random perks (sockets 3, 4, 5)
- **API endpoints** capture only perk socket data
- **Perk icons** already generated in `perk-icons.json`

## Design Goals

- Extend display without adding visual clutter
- Maintain consistency with existing icon-based design
- Show all socket information at a glance
- Keep implementation simple and maintainable

## Architecture

### 1. Data Collection (Backend)

**Extend socket capture** in API endpoints (`/api/roulette/rolls` and `/api/roulette/intersection`):
- Socket 1: Barrel/Sight
- Socket 2: Magazine/Battery
- Sockets 3-5: Perks (already captured)
- Socket 6+: Masterwork

**Current limitation:** Code only processes `PERK_SOCKET_INDICES = [3, 4, 5]`  
**Solution:** Extend to capture all sockets 1-6, organize by type in response

### 2. Icon Data

**Extend build script** (`scripts/build-weapons-table.mjs`) to generate `perk-icons.json` for all pluggable items (already done from previous perk icons work). Masterwork icons come from same source as perk icons.

### 3. Data Structures

**Update RollInstance** (in both API and RollDetails component):
```typescript
perkHashes: number[];        // sockets 3-5 (existing)
perkIcons: Record<number, string>;  // (existing)
barrelHash?: number;         // NEW: socket 1
barrelIcon?: string;         // NEW
magazineHash?: number;       // NEW: socket 2
magazineIcon?: string;       // NEW
masterworkHash?: number;     // NEW: socket 6+
masterworkIcon?: string;     // NEW
masterworkName?: string;     // NEW: masterworks have special display needs
```

### 4. UI Display (Frontend)

**RollDetails component:**
- Show icons in sequence: barrel → magazine → perk1 → perk2 → perk3 → masterwork
- All as `<img>` tags with `title` attribute for hover tooltip
- No labels needed (icons + hover is sufficient)
- Optional: subtle visual separator between barrel/mag and perks
- Optional: subtle visual separator before masterwork

**Compare section:**
- Same layout, scaled down (smaller icons for space)

### 5. API Response Structure

```typescript
interface RollInstance {
  instanceId: string;
  location: "character" | "vault";
  // Existing perk data
  perks: string[];           // names of perks
  perkHashes: number[];      // hashes of perks
  perkIcons: Record<number, string>;  // hash -> icon URL
  // New socket data
  barrelHash?: number;
  barrelIcon?: string;
  barrelName?: string;
  magazineHash?: number;
  magazineIcon?: string;
  magazineName?: string;
  masterworkHash?: number;
  masterworkIcon?: string;
  masterworkName?: string;
  // Existing
  stats: Record<string, number>;
  lightLevel: number;
}
```

## Implementation Scope

1. **Build script:** Already generates perk-icons.json (covers all items, including masterwork)
2. **API endpoints:** Update socket capture logic and response structure
3. **RollDetails component:** Add icon display for barrel, magazine, masterwork
4. **Styling:** Minimal - reuse existing icon styles, maybe add gap/separator

## Success Criteria

- ✅ All 6 socket items displayed on loadout page
- ✅ Hover tooltips show item names
- ✅ Visually clean, no clutter
- ✅ Works in both "Your Roll" and "Compare" sections
- ✅ No breaking changes to existing perk display

## Data Flow

```
Bungie API (component 305 ItemSockets)
    ↓
lib/bungie/inventory.ts getWeapons()
    ↓
Captures sockets 1, 2, 3-5, 6
    ↓
app/api/roulette/rolls/route.ts
    ↓
getPerkNames() + getPerkIcons() for all hashes
    ↓
RollInstance { barrelHash, barrelIcon, ..., masterworkHash, ... }
    ↓
RollDetails component renders icons in sequence
```

## Notes

- Masterwork icons may have different aspect ratios than perk icons (account for in CSS if needed)
- Some weapons have no masterwork (shouldn't happen for instances, but handle gracefully)
- Barrel/magazine are always present on D2 weapons
