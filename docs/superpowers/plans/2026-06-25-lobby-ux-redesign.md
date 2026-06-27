# Lobby UX/UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the lobby page to be cinematic and uncluttered — slot-machine spin animation, two-column layout with a fireteam+guardian sidebar, captain controls inlined per-slot, and stats/settings in always-visible tabs and collapsible drawers.

**Architecture:** Restructure `LobbyRoom.tsx` JSX layout (no state/logic changes), replace `LoadoutQueue.tsx` flicker animation with a CSS-transition reel, add a `variant` prop to `PlayerCard.tsx` for the compact sidebar form, and extract `RollSettingsPopover.tsx` for the gear-icon popover. New Tailwind keyframes power the land-glow and fade-in effects.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind CSS. Type-check with `npx tsc --noEmit`. No Jest tests for UI components — verify visually at `http://localhost:3000`.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `tailwind.config.ts` | Modify | Add `slot-land` (border glow pulse) and `fade-in` keyframes |
| `components/PlayerCard.tsx` | Modify | Add `variant="sidebar"` prop for compact 26px-avatar rows |
| `components/RollSettingsPopover.tsx` | Create | Floating popover: mode, reroll budget, no-dup, ban types |
| `components/LoadoutQueue.tsx` | Modify | Replace setInterval flicker with CSS-transition vertical reel; add per-slot hover reroll + inline mode badge |
| `components/LobbyRoom.tsx` | Modify | Two-column layout, fireteam+guardian sidebar, top-bar overflow menu, always-visible stats tabs, drawers for settings+pool |

---

## Task 1: Tailwind keyframes

**Files:**
- Modify: `tailwind.config.ts`

- [ ] **Add `slot-land` and `fade-in` keyframes**

Replace the `keyframes` and `animation` blocks in `tailwind.config.ts` with:

```ts
keyframes: {
  "bounce-in": {
    "0%": { transform: "scale(0.5)", opacity: "0" },
    "60%": { transform: "scale(1.1)", opacity: "1" },
    "100%": { transform: "scale(1)", opacity: "1" },
  },
  "pick-pop": {
    "0%": { transform: "scale(0.7) rotate(-6deg)", opacity: "0.3" },
    "55%": { transform: "scale(1.18) rotate(3deg)", opacity: "1" },
    "100%": { transform: "scale(1) rotate(0deg)", opacity: "1" },
  },
  "slot-land": {
    "0%":   { boxShadow: "0 0 0 0 rgba(0,174,239,0)" },
    "30%":  { boxShadow: "0 0 0 4px rgba(0,174,239,0.55)" },
    "100%": { boxShadow: "0 0 0 0 rgba(0,174,239,0)" },
  },
  "fade-in": {
    "0%":   { opacity: "0" },
    "100%": { opacity: "1" },
  },
},
animation: {
  "bounce-in": "bounce-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
  "pick-pop":  "pick-pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)",
  "slot-land": "slot-land 0.6s ease-out forwards",
  "fade-in":   "fade-in 0.15s ease-out forwards",
},
```

- [ ] **Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Commit**

```bash
git add tailwind.config.ts
git commit -m "feat(#130): add slot-land and fade-in tailwind keyframes"
```

---

## Task 2: PlayerCard sidebar variant

**Files:**
- Modify: `components/PlayerCard.tsx`

- [ ] **Add `variant` prop and sidebar render path**

Replace the entire file content:

```tsx
"use client";

import { useState } from "react";
import { trimBungieName } from "@/lib/utils";
import type { LobbyMember } from "@/types/lobby";

interface Props {
  member: LobbyMember;
  variant?: "default" | "sidebar";
}

export default function PlayerCard({ member, variant = "default" }: Props) {
  const [bgFailed, setBgFailed] = useState(false);
  const [iconFailed, setIconFailed] = useState(false);

  const bgUrl =
    !bgFailed && member.emblem_background_path
      ? `https://www.bungie.net${member.emblem_background_path}`
      : null;

  const iconUrl =
    !iconFailed && member.emblem_path
      ? `https://www.bungie.net${member.emblem_path}`
      : null;

  if (variant === "sidebar") {
    return (
      <div
        className={`flex items-center gap-2 px-1 py-1.5 rounded-lg ${
          member.is_captain ? "text-yellow-400" : member.is_spectator ? "text-gray-600 opacity-60" : "text-gray-300"
        }`}
      >
        {/* Compact emblem icon */}
        <div className="relative shrink-0 w-[26px] h-[26px] rounded overflow-hidden border border-white/10">
          {iconUrl ? (
            <img src={iconUrl} alt="" className="w-full h-full object-cover" onError={() => setIconFailed(true)} />
          ) : (
            <div className="w-full h-full bg-bungie-border/30 flex items-center justify-center text-[10px]">
              {member.is_captain ? "👑" : "👤"}
            </div>
          )}
        </div>
        {/* Name */}
        <span className="text-xs font-medium truncate flex-1 min-w-0">
          {member.is_captain && <span className="mr-1">👑</span>}
          {trimBungieName(member.display_name)}
        </span>
        {/* Ready check */}
        {!member.is_spectator && member.selected_character_id && (
          <span className="text-green-400 text-xs shrink-0">✓</span>
        )}
      </div>
    );
  }

  return (
    <div
      className={`relative flex items-center gap-0 rounded-lg overflow-hidden border h-16 min-w-[260px] max-w-[340px]
        ${member.is_captain
          ? "border-yellow-500/60"
          : member.is_spectator
          ? "border-bungie-border opacity-60"
          : "border-bungie-border"
        }`}
    >
      {bgUrl ? (
        <>
          <img src={bgUrl} alt="" className="hidden" onError={() => setBgFailed(true)} />
          <div className="absolute inset-0 bg-cover bg-left" style={{ backgroundImage: `url(${bgUrl})` }} />
          <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-black/50 to-black/80" />
        </>
      ) : (
        <div className="absolute inset-0 bg-bungie-dark" />
      )}

      <div className="relative shrink-0 w-16 h-16">
        {iconUrl ? (
          <img src={iconUrl} alt="" className="w-full h-full object-cover" onError={() => setIconFailed(true)} />
        ) : (
          <div className="w-full h-full bg-bungie-border/30" />
        )}
      </div>

      <div className="relative flex-1 flex items-center gap-2 px-3 min-w-0">
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5">
            {member.is_captain && <span className="text-xs">👑</span>}
            <span className={`text-sm font-semibold truncate leading-tight ${member.is_spectator ? "text-gray-500" : "text-white"}`}>
              {trimBungieName(member.display_name)}
            </span>
          </div>
          {member.is_spectator && (
            <span className="text-[10px] text-gray-500 leading-tight">spectating</span>
          )}
        </div>
        {!member.is_spectator && member.selected_character_id && (
          <span className="ml-auto shrink-0 text-green-400 text-xs" title="Guardian selected">✓</span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Commit**

```bash
git add components/PlayerCard.tsx
git commit -m "feat(#130): add sidebar variant to PlayerCard"
```

---

## Task 3: RollSettingsPopover component

**Files:**
- Create: `components/RollSettingsPopover.tsx`

The popover is rendered by `LobbyRoom` only for the captain. It is positioned below the gear `⚙️` button using an anchor ref and dismissed by clicking outside.

- [ ] **Create the file**

```tsx
"use client";

import { useEffect, useRef } from "react";
import type { WeaponSlot } from "@/types/bungie";

interface Props {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  rollMode: "normal" | "chaos" | "meta";
  onRollModeChange: (m: "normal" | "chaos" | "meta") => void;
  rerollLimit: number | null;
  onRerollLimitChange: (v: number | null) => void;
  rerollsUsed: number;
  noDupMode: boolean;
  onNoDupChange: (v: boolean) => void;
  bannedTypes: Set<string>;
  onBannedTypesChange: (next: Set<string>) => void;
  poolWeaponTypes: string[];
}

export default function RollSettingsPopover({
  anchorRef, onClose,
  rollMode, onRollModeChange,
  rerollLimit, onRerollLimitChange,
  rerollsUsed,
  noDupMode, onNoDupChange,
  bannedTypes, onBannedTypesChange,
  poolWeaponTypes,
}: Props) {
  const popoverRef = useRef<HTMLDivElement>(null);

  // Dismiss on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [anchorRef, onClose]);

  const rerollExhausted = rerollLimit !== null && rerollsUsed >= rerollLimit;

  return (
    <div
      ref={popoverRef}
      className="absolute right-0 top-full mt-2 z-50 w-72 bg-bungie-surface border border-bungie-border/60 rounded-xl shadow-2xl p-4 space-y-4"
    >
      {/* Mode */}
      <div>
        <label className="block text-xs text-gray-400 mb-1.5">Roll Mode</label>
        <div className="flex gap-2">
          {(["normal", "chaos", "meta"] as const).map((m) => (
            <button
              key={m}
              onClick={() => onRollModeChange(m)}
              className={`flex-1 py-1.5 text-xs rounded-lg border capitalize transition ${
                rollMode === m
                  ? "border-bungie-blue bg-bungie-blue/20 text-white font-semibold"
                  : "border-bungie-border text-gray-400 hover:border-gray-400"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Reroll limit */}
      <div>
        <label className="block text-xs text-gray-400 mb-1.5">
          Rerolls / round
          {rerollLimit !== null && (
            <span className={`ml-2 font-semibold ${rerollExhausted ? "text-red-400" : "text-gray-300"}`}>
              {Math.max(0, rerollLimit - rerollsUsed)} left
            </span>
          )}
        </label>
        <div className="flex gap-2">
          {([null, 3, 5, 10] as const).map((v) => (
            <button
              key={String(v)}
              onClick={() => onRerollLimitChange(v)}
              className={`flex-1 py-1.5 text-xs rounded-lg border transition ${
                rerollLimit === v
                  ? "border-bungie-blue bg-bungie-blue/20 text-white font-semibold"
                  : "border-bungie-border text-gray-400 hover:border-gray-400"
              }`}
            >
              {v === null ? "∞" : v}
            </button>
          ))}
        </div>
      </div>

      {/* No duplicates */}
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={noDupMode}
          onChange={(e) => onNoDupChange(e.target.checked)}
          className="accent-bungie-blue w-3.5 h-3.5"
        />
        <span className="text-xs text-gray-400">No duplicate weapon types</span>
      </label>

      {/* Ban weapon types */}
      {poolWeaponTypes.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-gray-400">Ban weapon types</span>
            {bannedTypes.size > 0 && (
              <button
                onClick={() => onBannedTypesChange(new Set())}
                className="text-[11px] text-gray-500 hover:text-gray-300 transition"
              >
                Clear all
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {poolWeaponTypes.map((t) => {
              const banned = bannedTypes.has(t);
              return (
                <button
                  key={t}
                  onClick={() => {
                    const n = new Set(bannedTypes);
                    if (n.has(t)) n.delete(t); else n.add(t);
                    onBannedTypesChange(n);
                  }}
                  className={`text-xs px-2 py-0.5 rounded border transition ${
                    banned
                      ? "border-red-700 bg-red-900/30 text-red-300 line-through"
                      : "border-bungie-border text-gray-300 hover:border-gray-400"
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Commit**

```bash
git add components/RollSettingsPopover.tsx
git commit -m "feat(#130): add RollSettingsPopover component"
```

---

## Task 4: Slot machine reel animation in LoadoutQueue

**Files:**
- Modify: `components/LoadoutQueue.tsx`

Replace the `setInterval` flicker with a CSS-transition vertical reel. Add per-slot hover `↺` reroll and inline mode-cycle badge. These require new props from `LobbyRoom`.

- [ ] **Update the Props interface and constants**

At the top of `LoadoutQueue.tsx`, after the existing imports, replace the `Props` interface and add constants:

```tsx
// Replace existing SPIN_STEP_MS / SPIN_TOTAL_MS with:
const REEL_ITEM_H = 80;
const REEL_PRE_COUNT = 15;
const SLOT_STAGGER_MS: Record<string, number> = { kinetic: 0, energy: 160, power: 320 };

type SlotMode = "normal" | "lock" | "wildcard";
const SLOT_MODE_ICONS: Record<SlotMode, string> = { normal: "🎲", lock: "🔒", wildcard: "👤" };

interface Props {
  slots: LobbyLoadoutSlot[];
  weaponDetails: Record<string, WeaponDetail>;
  instancePerks?: Record<string, InstancePerk[]>;
  collectionHashes?: Set<number>;
  onApply: () => void;
  onCancelApply: () => void;
  selectedCharId: string | null;
  loading: boolean;
  animKindRef?: React.MutableRefObject<Record<string, AnimKind>>;
  // Captain-only inline controls
  isCaptain?: boolean;
  lockedSlots?: Set<string>;
  wildcardSlots?: Set<string>;
  onCycleSlotMode?: (slot: WeaponSlot) => void;
  onRerollSlot?: (slot: WeaponSlot) => void;
  rerollExhausted?: boolean;
}
```

- [ ] **Replace `WeaponSlotContent` with the reel implementation**

Delete the old `WeaponSlotContent` function entirely and replace with:

```tsx
function WeaponSlotContent({
  hash, icon, watermark, name, weaponType, damageType, isCollection,
  iconPool, slot, animKindRef,
}: {
  hash: number; icon: string; watermark?: string; name: string;
  weaponType: string; damageType: string; isCollection: boolean;
  iconPool: string[]; slot: string;
  animKindRef?: React.MutableRefObject<Record<string, AnimKind>>;
}) {
  const [reelItems, setReelItems] = useState<string[]>([icon]);
  const [spinning, setSpinning] = useState(false);
  const [landed, setLanded] = useState(false);
  const [picked, setPicked] = useState(false);
  const [popKey, setPopKey] = useState(0);
  const reelRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);
  const prevHash = useRef(hash);

  // Effect 1: detect hash change and build reel
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      prevHash.current = hash;
      setReelItems([icon]);
      return;
    }
    if (hash === prevHash.current) return;
    prevHash.current = hash;

    const kind: AnimKind = animKindRef?.current[slot] ?? "roll";

    if (kind === "pick" || iconPool.length < 2) {
      setReelItems([icon]);
      setSpinning(false);
      setPicked(true);
      setPopKey((k) => k + 1);
      const t = setTimeout(() => setPicked(false), 600);
      return () => clearTimeout(t);
    }

    const delay = SLOT_STAGGER_MS[slot] ?? 0;
    const staggerTimer = setTimeout(() => {
      const randoms = Array.from({ length: REEL_PRE_COUNT }, () =>
        iconPool[Math.floor(Math.random() * iconPool.length)]
      );
      setReelItems([...randoms, icon]);
      setSpinning(true);
      setLanded(false);
    }, delay);
    return () => clearTimeout(staggerTimer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash]);

  // Effect 2: when reelItems updates and we're spinning, kick off CSS transition
  useEffect(() => {
    if (!spinning || reelItems.length < 2) return;
    const reel = reelRef.current;
    if (!reel) return;

    const targetY = -((reelItems.length - 1) * REEL_ITEM_H);

    // Reset to top without transition, then animate to bottom
    reel.style.transition = "none";
    reel.style.transform = "translateY(0)";

    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        reel.style.transition = "transform 900ms cubic-bezier(0.1, 0.6, 0.3, 1)";
        reel.style.transform = `translateY(${targetY}px)`;
      });
    });

    const landTimer = setTimeout(() => {
      setSpinning(false);
      setReelItems([icon]);
      if (reel) { reel.style.transition = "none"; reel.style.transform = "translateY(0)"; }
      setLanded(true);
      setTimeout(() => setLanded(false), 600);
    }, 950);

    return () => {
      cancelAnimationFrame(id);
      clearTimeout(landTimer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinning, reelItems]);

  return (
    <>
      {/* Icon container */}
      <div
        key={popKey}
        className={`relative rounded-lg overflow-hidden transition-shadow duration-300 ${
          picked ? "animate-pick-pop ring-2 ring-bungie-blue" : ""
        } ${landed ? "animate-slot-land" : ""}`}
        style={{ width: REEL_ITEM_H, height: REEL_ITEM_H }}
      >
        <div ref={reelRef} style={{ willChange: "transform" }}>
          {reelItems.map((ic, idx) => (
            <div key={idx} style={{ width: REEL_ITEM_H, height: REEL_ITEM_H, position: "relative" }}>
              <Image src={ic} alt="" fill className="object-cover" unoptimized />
              {idx === reelItems.length - 1 && !spinning && watermark && (
                <Image src={watermark} alt="" fill className="object-cover pointer-events-none" unoptimized />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Name / type below icon */}
      <div className="text-center">
        {spinning ? (
          <p className="text-bungie-blue text-xs font-semibold animate-pulse">Rolling…</p>
        ) : (
          <div className="animate-fade-in">
            <p className="text-white text-xs font-semibold leading-tight">{name}</p>
            <p className="text-gray-400 text-xs">{weaponType}</p>
            <p className={`text-xs ${DAMAGE_COLOR[damageType] ?? "text-gray-500"}`}>{damageType}</p>
            {isCollection && (
              <span className="mt-1 inline-block text-[10px] bg-amber-500/20 border border-amber-500/40 text-amber-300 rounded px-1.5 py-0.5 leading-none">
                Pull from Collections
              </span>
            )}
          </div>
        )}
      </div>
    </>
  );
}
```

- [ ] **Update `LoadoutQueue` default export to use new props and add inline controls**

Replace the `LoadoutQueue` function body's `return` statement (the `<div className="bg-bungie-surface ...">` block). Keep everything above the return statement as-is. Replace the return:

```tsx
  return (
    <div className="bg-bungie-surface border border-bungie-border/40 rounded-xl p-5">
      {tooltipNode}
      <div className="grid grid-cols-3 gap-4 mb-5">
        {SLOT_ORDER.map((slotName) => {
          const slot = sorted.find((s) => s.slot === slotName);
          const isWildcard = slot?.item_hash === 0;
          const hasWeapon = !!slot && slot.item_hash !== 0;
          const theme = hasWeapon ? damageTheme(slot!.damage_type) : null;

          const slotMode: SlotMode = lockedSlots?.has(slotName)
            ? "lock"
            : wildcardSlots?.has(slotName)
            ? "wildcard"
            : "normal";

          return (
            <div key={slotName} className="flex flex-col items-center gap-2">
              {/* Slot icon with hover reroll */}
              <div
                onMouseEnter={hasWeapon ? (e) => onHover(slot!.item_hash, e.currentTarget) : undefined}
                onMouseLeave={hasWeapon ? onLeave : undefined}
                className={`relative rounded-lg border transition group ${
                  isWildcard
                    ? "bg-bungie-dark/40 border-gray-700/40"
                    : hasWeapon && theme
                    ? `${theme.bg} ${theme.border} cursor-help`
                    : "bg-bungie-dark border-bungie-border/40"
                }`}
                style={{ width: REEL_ITEM_H, height: REEL_ITEM_H }}
              >
                {/* Slot label */}
                <span className="absolute top-1 left-0 right-0 text-center text-[9px] text-gray-500 uppercase tracking-wider z-10 pointer-events-none">
                  {SLOT_LABELS[slotName]}
                </span>

                {/* Captain hover reroll button */}
                {isCaptain && hasWeapon && onRerollSlot && !rerollExhausted && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onRerollSlot(slotName as WeaponSlot); }}
                    title={`Reroll ${slotName}`}
                    className="absolute top-1 right-1 z-20 opacity-0 group-hover:opacity-100 transition-opacity bg-bungie-dark/80 rounded-full p-0.5 text-[11px] hover:text-bungie-blue"
                  >
                    ↺
                  </button>
                )}

                {/* Content */}
                {isWildcard ? (
                  <div className="w-full h-full flex items-center justify-center text-2xl opacity-40 grayscale">
                    👤
                  </div>
                ) : slot ? (
                  <WeaponSlotContent
                    hash={slot.item_hash}
                    icon={slot.weapon_icon}
                    watermark={weaponDetails[slot.item_hash]?.watermark}
                    name={slot.weapon_name}
                    weaponType={slot.weapon_type}
                    damageType={slot.damage_type}
                    isCollection={collectionHashes.has(slot.item_hash)}
                    iconPool={iconPool}
                    slot={slotName}
                    animKindRef={animKindRef}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-600 text-xl">?</div>
                )}
              </div>

              {/* Wildcard label */}
              {isWildcard && (
                <div className="text-center opacity-60">
                  <p className="text-gray-400 text-xs font-semibold">Your Own</p>
                  <p className="text-gray-500 text-[10px]">Skipped on apply</p>
                </div>
              )}

              {/* Captain inline slot mode badge */}
              {isCaptain && onCycleSlotMode && (
                <button
                  onClick={() => onCycleSlotMode(slotName as WeaponSlot)}
                  title="Click to cycle: Random → Locked → Your own"
                  className={`text-[10px] px-2 py-0.5 rounded-full border transition ${
                    slotMode === "lock"
                      ? "border-yellow-500/60 bg-yellow-500/10 text-yellow-300"
                      : slotMode === "wildcard"
                      ? "border-purple-500/60 bg-purple-500/10 text-purple-300"
                      : "border-bungie-border/40 text-gray-500 hover:border-gray-500"
                  }`}
                >
                  {SLOT_MODE_ICONS[slotMode]} {slotMode === "normal" ? "Random" : slotMode === "lock" ? "Locked" : "Yours"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Apply row */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={onApply}
          disabled={!selectedCharId || loading || sorted.length < 3}
          className="px-5 py-2.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-semibold rounded-full transition text-sm"
        >
          {loading ? "Applying…" : "⚡ Apply Loadout"}
        </button>
        {loading && (
          <button
            onClick={onCancelApply}
            className="px-3 py-2.5 border border-red-800 text-red-400 hover:text-red-300 hover:border-red-600 rounded-full text-sm transition"
          >
            Cancel
          </button>
        )}
        {!selectedCharId && !loading && (
          <span className="text-xs text-yellow-400">Select a character first</span>
        )}
        {!loading && <span className="text-xs text-gray-600">Must be in orbit or social space</span>}
      </div>
    </div>
  );
```

- [ ] **Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors. If `WeaponSlot` type is not imported, add it: `import type { WeaponSlot } from "@/types/bungie";`

- [ ] **Commit**

```bash
git add components/LoadoutQueue.tsx
git commit -m "feat(#130): slot machine reel animation with stagger, inline slot controls"
```

---

## Task 5: LobbyRoom — sidebar (fireteam + guardian picker)

**Files:**
- Modify: `components/LobbyRoom.tsx`

Add the sidebar structure and remove the standalone "Your Character" section. The sidebar will be rendered inside the top-level `<div className="flex gap-6 items-start">`.

- [ ] **Add sidebar state**

In `LobbyRoom`, find the line:
```tsx
const [showWeaponBrowser, setShowWeaponBrowser] = useState(true);
```

Add directly after it:
```tsx
const [showRollSettingsPopover, setShowRollSettingsPopover] = useState(false);
const gearButtonRef = useRef<HTMLButtonElement | null>(null);
```

- [ ] **Build the sidebar JSX constant**

Find this block near the bottom of `LobbyRoom` (just before the `return`):

```tsx
const weaponBrowser = intersection && showWeaponBrowser ? (
```

Add the following sidebar constant just above that block:

```tsx
const CLASS_ICONS: Record<number, string> = { 0: "🛡️", 1: "🏹", 2: "🔮" };

const sidebar = (
  <aside className="hidden xl:flex xl:flex-col w-36 shrink-0 sticky top-6 max-h-[calc(100vh-3rem)] gap-0 bg-bungie-surface border border-bungie-border/40 rounded-xl overflow-hidden">
    {/* Fireteam */}
    <div className="px-3 pt-3 pb-2">
      <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-2">Fireteam</p>
      <div className="space-y-0.5">
        {members.map((m) => (
          <PlayerCard key={m.id} member={m} variant="sidebar" />
        ))}
      </div>
    </div>

    {/* Divider */}
    {characters.length > 0 && !isSpectator && (
      <>
        <div className="mx-3 h-px bg-bungie-border/40" />
        {/* Guardian picker */}
        <div className="px-3 pt-2 pb-3">
          <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-2">Your Guardian</p>
          <div className="space-y-1">
            {[...characters]
              .sort((a, b) => CLASS_ORDER.indexOf(a.classType) - CLASS_ORDER.indexOf(b.classType))
              .map((c) => (
                <button
                  key={c.characterId}
                  onClick={() => handleSelectCharacter(c.characterId)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border text-left transition ${
                    selectedCharId === c.characterId
                      ? "border-bungie-blue/50 bg-bungie-blue/10 text-white"
                      : "border-transparent text-gray-400 hover:border-bungie-border hover:text-gray-300"
                  }`}
                >
                  <span className="text-sm">{CLASS_ICONS[c.classType] ?? "👤"}</span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold leading-tight">{CLASS_NAMES[c.classType] ?? "Guardian"}</p>
                    <p className="text-[9px] text-gray-500 leading-tight">{c.light}</p>
                  </div>
                  {selectedCharId === c.characterId && (
                    <span className="ml-auto text-green-400 text-[10px]">✓</span>
                  )}
                </button>
              ))}
          </div>
        </div>
      </>
    )}
  </aside>
);
```

- [ ] **Update the return statement to use the sidebar**

In the `return (...)`, find the outermost wrapper div:
```tsx
<div className="flex gap-6 items-start">
```

Change it to:
```tsx
<div className="flex gap-5 items-start">
```

Then find the closing `</div>` of that wrapper (currently it ends with the weapon pool sidebar block). Replace the entire tail of the `return` — from the existing weapon-pool `<div className="hidden xl:flex ...">` block to the end of the `<>` wrapper — with:

```tsx
      {sidebar}
    </div>
    </>
  );
```

(The weapon pool panel moves to a drawer in Task 7.)

- [ ] **Remove the standalone "Your Character" section**

Find and delete this entire block (~lines 1316–1338 in the original file):

```tsx
{/* Character picker - selecting your guardian is all a player needs to do */}
{characters.length > 0 && !isSpectator && (
  <div className="bg-bungie-surface border border-bungie-border rounded-xl p-4">
    ...
  </div>
)}
```

- [ ] **Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Commit**

```bash
git add components/LobbyRoom.tsx
git commit -m "feat(#130): lobby sidebar with fireteam + guardian picker"
```

---

## Task 6: LobbyRoom — top bar overflow menu

**Files:**
- Modify: `components/LobbyRoom.tsx`

Collapse Leave / Spectate / End Session / Sign out into a `···` dropdown menu.

- [ ] **Add overflow menu state**

Find the line added in Task 5:
```tsx
const [showRollSettingsPopover, setShowRollSettingsPopover] = useState(false);
```

Add directly after:
```tsx
const [showOverflowMenu, setShowOverflowMenu] = useState(false);
const overflowMenuRef = useRef<HTMLDivElement>(null);
```

- [ ] **Add click-outside dismiss for overflow menu**

Add this `useEffect` near the other click-outside effects:

```tsx
useEffect(() => {
  function handler(e: MouseEvent) {
    if (overflowMenuRef.current && !overflowMenuRef.current.contains(e.target as Node)) {
      setShowOverflowMenu(false);
    }
  }
  if (showOverflowMenu) document.addEventListener("mousedown", handler);
  return () => document.removeEventListener("mousedown", handler);
}, [showOverflowMenu]);
```

- [ ] **Replace the header JSX**

Find the `{/* Header */}` block (starts at `<div className="flex items-center justify-between">`) and replace the entire block with:

```tsx
{/* Header */}
<div className="flex items-center justify-between gap-3">
  <div>
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={copyCode}
        title="Copy lobby code"
        className="font-mono text-bungie-blue font-bold tracking-widest text-lg hover:opacity-75 transition"
      >
        {copied ? "✓" : lobby.code}
      </button>
      <button
        onClick={copyLink}
        className="text-xs px-2 py-0.5 rounded border border-bungie-border/40 text-gray-400 hover:border-gray-500 transition"
      >
        {copiedLink ? "✓" : "Invite"}
      </button>
      <button
        onClick={copyWatchLink}
        className="text-xs px-2 py-0.5 rounded border border-bungie-border/40 text-gray-400 hover:border-gray-500 transition"
      >
        {copiedWatch ? "✓" : "Watch"}
      </button>
    </div>
    <div className="flex items-center gap-2 mt-0.5">
      {(() => {
        const cfg = LOBBY_STATUS_BADGE[lobbyData.status] ?? LOBBY_STATUS_BADGE.waiting;
        return <span className={`text-xs px-2 py-0.5 rounded-full border ${cfg.cls}`}>{cfg.label}</span>;
      })()}
      <span className="text-xs text-gray-500">Round {lobbyData.current_round}</span>
      {isCaptain && <span className="text-xs text-yellow-400">👑 Your turn</span>}
      {polling && <span className="text-xs text-green-500 animate-pulse">● watching</span>}
    </div>
  </div>

  {/* Overflow menu */}
  <div ref={overflowMenuRef} className="relative">
    <button
      onClick={() => setShowOverflowMenu((v) => !v)}
      className="px-2.5 py-1.5 text-gray-400 border border-bungie-border/40 rounded-lg hover:border-gray-500 transition text-sm"
      aria-label="More actions"
    >
      ···
    </button>
    {showOverflowMenu && (
      <div className="absolute right-0 top-full mt-1 z-50 bg-bungie-surface border border-bungie-border rounded-xl shadow-2xl overflow-hidden min-w-[160px]">
        {!isCaptain && (
          <button
            onClick={() => { handleToggleSpectate(); setShowOverflowMenu(false); }}
            className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-bungie-dark transition"
          >
            {isSpectator ? "Rejoin" : "Spectate"}
          </button>
        )}
        {isHost && (
          <button
            onClick={() => { setShowOverflowMenu(false); handleEndSession(); }}
            className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-bungie-dark transition"
          >
            End Session
          </button>
        )}
        <button
          onClick={() => { setShowOverflowMenu(false); handleLeave(); }}
          className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-bungie-dark transition"
        >
          Leave
        </button>
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="w-full text-left px-4 py-2.5 text-sm text-gray-500 hover:bg-bungie-dark transition border-t border-bungie-border/40"
        >
          Sign out
        </button>
      </div>
    )}
  </div>
</div>
```

- [ ] **Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Commit**

```bash
git add components/LobbyRoom.tsx
git commit -m "feat(#130): collapse lobby header actions into overflow menu"
```

---

## Task 7: LobbyRoom — action row with RollSettingsPopover + drawers

**Files:**
- Modify: `components/LobbyRoom.tsx`

Replace the captain panel yellow-box section with a clean action row. Add collapsible drawers for Roll Settings and Weapon Pool.

- [ ] **Add drawer state**

Find the `showRollSettingsPopover` state line added in Task 5. Add below it:

```tsx
const [rollSettingsOpen, setRollSettingsOpen] = useState(false);
const [weaponPoolOpen, setWeaponPoolOpen] = useState(false);
```

- [ ] **Import RollSettingsPopover**

At the top of `LobbyRoom.tsx`, add to the imports:

```tsx
import RollSettingsPopover from "./RollSettingsPopover";
```

- [ ] **Replace the captain panel section**

Find the entire captain section block:
```tsx
{/* Captain controls */}
{isCaptain && (
  <div className="bg-yellow-500/10 border border-yellow-500/40 rounded-xl p-4">
    ...
  </div>
)}
```

Replace it with the new action row (shown to all non-spectators once a round exists, not just captains):

```tsx
{/* Action row — Roll All / Apply / settings gear */}
{!isSpectator && roundId && (
  <div className="relative flex items-center gap-3 flex-wrap">
    {isCaptain && (
      <button
        onClick={() => handleRoll()}
        disabled={loadingAction !== null || rerollExhausted || !intersection}
        className="px-5 py-2.5 bg-bungie-blue hover:opacity-90 disabled:opacity-40 text-white font-bold rounded-full transition text-sm"
      >
        {loadingAction === "roll" ? "Rolling…" : "🎲 Roll All"}
      </button>
    )}

    {slots.some((s) => s.item_hash !== 0) && (
      <button
        onClick={handleApply}
        disabled={!selectedCharId || loadingAction === "apply" || slots.length < 3}
        className="px-5 py-2.5 bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white font-bold rounded-full transition text-sm"
      >
        {loadingAction === "apply" ? "Applying…" : "⚡ Apply"}
      </button>
    )}

    {loadingAction === "apply" && (
      <button
        onClick={handleCancelApply}
        className="px-3 py-2.5 border border-red-800 text-red-400 hover:border-red-600 rounded-full text-sm transition"
      >
        Cancel
      </button>
    )}

    {isCaptain && intersection && (
      <button
        ref={gearButtonRef}
        onClick={() => setShowRollSettingsPopover((v) => !v)}
        className={`px-2.5 py-2.5 border rounded-full text-sm transition ${
          showRollSettingsPopover
            ? "border-bungie-blue/50 bg-bungie-blue/10 text-bungie-blue"
            : "border-bungie-border/40 text-gray-400 hover:border-gray-500"
        }`}
        aria-label="Roll settings"
      >
        ⚙️
      </button>
    )}

    {intersectionError && (
      <span className="text-xs text-red-400">{intersectionError}</span>
    )}
    {!intersection && isCaptain && loadingAction === "intersection" && (
      <span className="text-xs text-gray-500 animate-pulse">Loading shared weapons…</span>
    )}

    {showRollSettingsPopover && isCaptain && (
      <RollSettingsPopover
        anchorRef={gearButtonRef}
        onClose={() => setShowRollSettingsPopover(false)}
        rollMode={rollMode}
        onRollModeChange={setRollMode}
        rerollLimit={rerollLimit}
        onRerollLimitChange={setRerollLimit}
        rerollsUsed={rerollsUsed}
        noDupMode={noDupMode}
        onNoDupChange={setNoDupMode}
        bannedTypes={bannedTypes}
        onBannedTypesChange={setBannedTypes}
        poolWeaponTypes={poolWeaponTypes}
      />
    )}
  </div>
)}
```

- [ ] **Add drawers after the loadout components**

Find this block:
```tsx
{slots.length > 0 && (
  <LoadoutQueue slots={slots} ...
```

Update the `LoadoutQueue` call to pass captain inline control props:

```tsx
{slots.length > 0 && (
  <LoadoutQueue
    slots={slots}
    weaponDetails={weaponDetails}
    instancePerks={instancePerks}
    collectionHashes={collectionHashes}
    onApply={handleApply}
    animKindRef={animKindRef}
    onCancelApply={handleCancelApply}
    selectedCharId={selectedCharId}
    loading={loadingAction === "apply"}
    isCaptain={isCaptain}
    lockedSlots={lockedSlots}
    wildcardSlots={wildcardSlots}
    onCycleSlotMode={cycleSlotMode}
    onRerollSlot={(slot) => handleRoll(slot)}
    rerollExhausted={rerollExhausted}
  />
)}
```

Then after the `ApplyStatus` block, add the drawers:

```tsx
{/* Drawers */}
<div className="space-y-2">
  {/* Roll Settings drawer (captain only) */}
  {isCaptain && intersection && (
    <div className="border border-bungie-border/40 rounded-xl overflow-hidden">
      <button
        onClick={() => setRollSettingsOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm text-gray-400 hover:text-gray-200 transition"
      >
        <span>⚙️ Roll Settings{bannedTypes.size > 0 ? ` · ${bannedTypes.size} banned` : ""}</span>
        <span className="text-xs">{rollSettingsOpen ? "▲" : "▼"}</span>
      </button>
      {rollSettingsOpen && (
        <div className="px-4 pb-4 border-t border-bungie-border/40">
          <RollSettingsPopover
            anchorRef={{ current: null }}
            onClose={() => {}}
            rollMode={rollMode}
            onRollModeChange={setRollMode}
            rerollLimit={rerollLimit}
            onRerollLimitChange={setRerollLimit}
            rerollsUsed={rerollsUsed}
            noDupMode={noDupMode}
            onNoDupChange={setNoDupMode}
            bannedTypes={bannedTypes}
            onBannedTypesChange={setBannedTypes}
            poolWeaponTypes={poolWeaponTypes}
          />
        </div>
      )}
    </div>
  )}

  {/* Weapon Pool drawer */}
  {!isSpectator && (
    <div className="border border-bungie-border/40 rounded-xl overflow-hidden">
      <button
        onClick={() => {
          if (!intersection && isCaptain) { handleLoadIntersection(); }
          setWeaponPoolOpen((v) => !v);
        }}
        className="w-full flex items-center justify-between px-4 py-3 text-sm text-gray-400 hover:text-gray-200 transition"
      >
        <span>
          🔫 Weapon Pool
          {effectiveIntersection
            ? ` · ${effectiveIntersection.kinetic.length + effectiveIntersection.energy.length + effectiveIntersection.power.length} shared`
            : !isCaptain
            ? ""
            : " · tap to load"}
        </span>
        <span className="text-xs">{weaponPoolOpen ? "▲" : "▼"}</span>
      </button>
      {weaponPoolOpen && (
        <div className="border-t border-bungie-border/40">
          {intersection ? (
            weaponBrowser ?? <p className="p-4 text-sm text-gray-500">Browse disabled.</p>
          ) : (
            <div className="p-4">
              {!isCaptain ? (
                <button
                  onClick={handleLoadIntersection}
                  disabled={loadingAction !== null}
                  className="w-full px-4 py-2.5 bg-bungie-blue rounded-lg text-sm text-white font-semibold hover:opacity-90 disabled:opacity-50 transition"
                >
                  {loadingAction === "intersection" ? "Loading…" : "Load Shared Weapons"}
                </button>
              ) : (
                <p className="text-sm text-gray-500">Loading shared weapons…</p>
              )}
              {intersectionError && <p className="mt-2 text-xs text-red-400">{intersectionError}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  )}
</div>
```

- [ ] **Remove the old `showPoolPanel` mobile block and the old xl sidebar**

Find and delete:
```tsx
{showPoolPanel && (
  <div className="xl:hidden">
    {poolHeader(false)}
    {intersection ? weaponBrowser : poolLoadButton(false)}
  </div>
)}
```

And the old `showPoolPanel && (intersection == null || showWeaponBrowser) &&` xl sidebar block. The weapon pool is now entirely in the drawer.

- [ ] **Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Commit**

```bash
git add components/LobbyRoom.tsx components/RollSettingsPopover.tsx
git commit -m "feat(#130): action row, gear popover, weapon pool + settings drawers"
```

---

## Task 8: LobbyRoom — stats tabs always-visible + ambient glow + polish

**Files:**
- Modify: `components/LobbyRoom.tsx`

Make stats always-visible (move above the loadout), add ambient glow behind the loadout area during rolling, remove the members section's separate card (members are now in the sidebar), and apply general polish.

- [ ] **Remove the standalone Fireteam card**

Find and delete the entire fireteam card block:
```tsx
{/* Members */}
<div className="bg-bungie-surface border border-bungie-border rounded-xl p-4">
  <div className="flex items-center justify-between mb-3">
    <h2 className="text-white font-semibold">Fireteam ({members.length})</h2>
    ...
  </div>
  ...
</div>
```

- [ ] **Move stats panel above the loadout with always-visible placement**

The stats panel currently sits near the top between the header and members section. Find the entire `{/* Stats panel: Session / History / Leaderboard tabs */}` block. Wrap it with `charactersPicked` guard removed (show always), and add a post-game banner above the tabs.

Replace the stats panel's outer `<div className="bg-bungie-surface border border-bungie-border rounded-xl overflow-hidden">` opening and its tab bar with:

```tsx
<div className="bg-bungie-surface border border-bungie-border/40 rounded-xl overflow-hidden">
  {/* Post-game dismissible banner */}
  {lastGameStats && lastGameStats.length > 0 && (() => {
    const top = [...lastGameStats].sort((a, b) => b.kills - a.kills)[0];
    const result = lastGameStats.find((s) => s.won != null)?.won ?? null;
    return (
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-bungie-border/40 bg-green-900/10">
        <span className="text-xs text-green-400 font-semibold">
          {result === true ? "W" : result === false ? "L" : "—"}
        </span>
        <span className="text-xs text-gray-300 flex-1 truncate">
          👑 {trimBungieName(top.displayName)} · {top.kills}K / {top.deaths}D
        </span>
        <button onClick={() => setLastGameStats(null)} className="text-gray-500 hover:text-gray-300 text-xs transition">✕</button>
      </div>
    );
  })()}

  {/* Tab bar */}
  <div className="flex border-b border-bungie-border/40">
```

Also update table row padding from `py-2` to `py-1.5` in both `StatsTable` and `SessionTotalsTable`.

- [ ] **Add ambient glow behind slots during rolling**

Find the slots area in `LoadoutQueue.tsx`. In `LobbyRoom`, wrap the `<LoadoutQueue>` render with a relative container that shows a glow when rolling:

Find:
```tsx
{slots.length > 0 && (
  <LoadoutQueue
```

Replace with:
```tsx
{slots.length > 0 && (
  <div className={`relative transition-all duration-500 ${loadingAction === "roll" ? "after:absolute after:inset-0 after:rounded-xl after:bg-bungie-blue/5 after:pointer-events-none" : ""}`}>
    <LoadoutQueue
```

Close the wrapper div after `</LoadoutQueue>`:
```tsx
    />
  </div>
)}
```

- [ ] **Increase section gaps to 24px**

In the main column `<div className="flex-1 min-w-0 space-y-6">`, change `space-y-6` to `space-y-6` — already 24px (6 × 4px). Verify all section gaps feel right visually; bump to `space-y-7` if needed.

- [ ] **Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Commit**

```bash
git add components/LobbyRoom.tsx
git commit -m "feat(#130): stats always-visible, fireteam card removed, ambient glow, polish"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Two-column layout with sidebar — Task 5
- ✅ Sidebar: fireteam (PlayerCard sidebar variant) + guardian picker — Tasks 2, 5
- ✅ Top bar overflow menu — Task 6
- ✅ Slot machine reel animation with stagger + land glow — Tasks 1, 4
- ✅ Action row (Roll All pill, Apply pill, gear icon) — Task 7
- ✅ Per-slot inline mode badge + hover reroll — Task 4
- ✅ RollSettingsPopover (mode, reroll, no-dup, ban types) — Task 3, 7
- ✅ Stats tabs always-visible — Task 8
- ✅ Post-game banner above tabs — Task 8
- ✅ Drawers for Roll Settings + Weapon Pool — Task 7
- ✅ Remove captain panel yellow box — Task 7
- ✅ Remove standalone fireteam card — Task 8
- ✅ Remove standalone character picker — Task 5
- ✅ Ambient glow during rolling — Task 8
- ✅ Tailwind keyframes (slot-land, fade-in) — Task 1

**Placeholder scan:** None found — all steps contain full code.

**Type consistency:**
- `SlotMode` defined in Task 4 (LoadoutQueue) and referenced only there — consistent.
- `RollSettingsPopover` Props interface defined in Task 3, consumed in Tasks 7 — props match.
- `gearButtonRef` typed as `useRef<HTMLButtonElement | null>` in Task 5, passed as `anchorRef` — matches `Props.anchorRef: React.RefObject<HTMLButtonElement | null>` in Task 3.
- `CLASS_ICONS` defined locally in Task 5 sidebar constant — not exported, only used there.
- `rerollExhausted` prop on `LoadoutQueue` is `boolean | undefined`; used with `!rerollExhausted` guard in the hover reroll button — consistent.
