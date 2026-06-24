# Match History Gun Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add weapon icons with count badges to the Game History table so players can see which weapons they used in each match at a glance.

**Architecture:** Add a "Weapons" column to the Game History table in the player stats page. For each match, display the most frequently rolled weapon with a badge showing the total number of unique weapons rolled. Use the existing weapon icon rendering pattern from the "Most Rolled Weapons" section.

**Tech Stack:** React/Next.js, Image component, existing weapons-table.json

---

## Task 1: Extract weapon display logic into a reusable component

**Files:**
- Create: `components/WeaponIcon.tsx`
- Modify: `app/stats/[userId]/page.tsx` - refactor existing weapon icon code to use new component

**Goal:** Create a reusable component to display weapon icons with optional count badges, DRY out duplicated code.

- [ ] **Step 1: Read the current weapon icon rendering code**

In `/app/stats/[userId]/page.tsx` lines 104-110, weapon icons are displayed with Image components. Create a reusable component that accepts a weapon object and optional count.

- [ ] **Step 2: Create WeaponIcon component**

Create `/components/WeaponIcon.tsx`:

```tsx
import Image from "next/image";

interface WeaponIconProps {
  icon: string;
  watermark?: string;
  name: string;
  size?: "small" | "medium" | "large";
  count?: number;
}

export default function WeaponIcon({ icon, watermark, name, size = "medium", count }: WeaponIconProps) {
  const sizeMap = {
    small: "w-6 h-6",
    medium: "w-9 h-9",
    large: "w-12 h-12",
  };

  return (
    <div className={`relative ${sizeMap[size]} shrink-0 rounded overflow-hidden bg-bungie-dark`}>
      <Image src={icon} alt={name} fill className="object-cover" unoptimized />
      {watermark && <Image src={watermark} alt="" fill className="object-cover absolute inset-0" unoptimized />}
      {count !== undefined && count > 1 && (
        <div className="absolute bottom-0 right-0 bg-bungie-blue text-white text-xs font-bold px-1.5 py-0.5 rounded-tl">
          {count}×
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Update Most Rolled Weapons section to use WeaponIcon**

In `/app/stats/[userId]/page.tsx`, replace lines 105-110 with the new component:

```tsx
<WeaponIcon 
  icon={e.def.icon} 
  watermark={e.def.watermark} 
  name={e.def.name}
  size="medium"
/>
```

- [ ] **Step 4: Test the component renders correctly**

Run the app and navigate to a player stats page. Verify the "Most Rolled Weapons" section still displays correctly with the new component.

- [ ] **Step 5: Commit**

```bash
git add components/WeaponIcon.tsx app/stats/[userId]/page.tsx
git commit -m "refactor: extract weapon icon rendering into reusable component"
```

---

## Task 2: Add weapons column to Game History table

**Files:**
- Modify: `app/stats/[userId]/page.tsx` - add weapons column and logic to get most common weapon per match

**Goal:** Display weapons in the Game History table with count badges showing how many unique weapons were rolled.

- [ ] **Step 1: Add weapon display logic to game history mapping**

In the game history table body (around line 146), we need to compute the most common weapon for each row. Modify the map function to extract and process roulette_hashes:

```tsx
{rows.map((row) => {
  const session = row.game_sessions as { played_at: string; roulette_hashes?: number[] } | null;
  const date = session?.played_at
    ? new Date(session.played_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : " - ";
  
  // Find the most common weapon from roulette_hashes
  let mostCommonWeapon: WeaponEntry | null = null;
  let weaponCount = 0;
  
  if (session?.roulette_hashes && session.roulette_hashes.length > 0) {
    const hashFreq = new Map<number, number>();
    for (const hash of session.roulette_hashes) {
      hashFreq.set(hash, (hashFreq.get(hash) ?? 0) + 1);
    }
    const [mostCommonHash] = [...hashFreq.entries()].sort((a, b) => b[1] - a[1])[0];
    mostCommonWeapon = weapons[mostCommonHash.toString()] ?? null;
    weaponCount = session.roulette_hashes.length;
  }
  
  return (
    <tr key={row.id} className="text-gray-300 hover:bg-bungie-dark/30 transition">
      <td className="px-4 py-2.5 text-gray-500 text-xs">{date}</td>
      <td className="px-3 py-2.5 text-right font-bold text-bungie-blue">{row.roulette_weapon_kills}</td>
      <td className="px-3 py-2.5 text-right">{row.kills}</td>
      <td className="px-3 py-2.5 text-right">{row.deaths}</td>
      <td className="px-3 py-2.5 text-right">{row.assists}</td>
      <td className="px-4 py-2.5 text-right">{Number(row.kd).toFixed(2)}</td>
      <td className="px-3 py-2.5">
        {mostCommonWeapon ? (
          <WeaponIcon 
            icon={mostCommonWeapon.icon}
            watermark={mostCommonWeapon.watermark}
            name={mostCommonWeapon.name}
            size="small"
            count={weaponCount}
          />
        ) : (
          <span className="text-gray-500 text-xs">-</span>
        )}
      </td>
    </tr>
  );
})}
```

- [ ] **Step 2: Update table header to include Weapons column**

In the `<thead>` section (around line 136), add a header for the new column after K/D:

```tsx
<tr className="text-gray-500 text-xs border-b border-bungie-border">
  <th className="text-left px-4 py-2">Date</th>
  <th className="text-right px-3 py-2">Roulette Kills</th>
  <th className="text-right px-3 py-2">K</th>
  <th className="text-right px-3 py-2">D</th>
  <th className="text-right px-3 py-2">A</th>
  <th className="text-right px-4 py-2">K/D</th>
  <th className="text-center px-3 py-2">Weapons</th>
</tr>
```

- [ ] **Step 3: Test the Game History table**

Run the app and navigate to a player stats page. Verify:
- The Weapons column appears in the Game History table
- Weapon icons display correctly with count badges
- Rows with no roulette_hashes show a "-" placeholder
- The layout doesn't break on mobile (weapons column scrolls with table)

- [ ] **Step 4: Commit**

```bash
git add app/stats/[userId]/page.tsx
git commit -m "feat: add weapon icons with count badges to Game History table (closes #30)"
```

---

## Verification Checklist

After implementing, verify:
- ✅ Weapon icons display in Game History for matches with roulette_hashes
- ✅ Count badge shows total number of unique weapons rolled (e.g., 3×)
- ✅ Empty cell shows "-" for matches with no weapon data
- ✅ Most Rolled Weapons section still works (uses refactored component)
- ✅ No TypeScript errors
- ✅ Icons load correctly (not broken image placeholders)
- ✅ Table layout is responsive on mobile
- ✅ Weapon icon styling matches existing design (bungie-dark background, rounded corners)
