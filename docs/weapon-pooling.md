# Weapon variant pooling

Destiny re-issues the same gun across expansions and seasons, and ships Adept /
craftable variants — **each with a different `itemHash`**. Without pooling, the
app treats "Rose (2022)" and "Rose (2024)" as unrelated weapons, so a player's
rolls don't all show and a teammate who owns a different release can't equip it.

## The grouping helper

`lib/bungie/definitions.ts → getWeaponGroupHashes(itemHash)` returns every hash
that represents the same weapon, grouped by **normalized name + weapon type**
(the Adept/Timelost/Harrowed suffix is stripped so those pool with the base).
It's built once from the static weapons table — no manifest regeneration needed.

```ts
getWeaponGroupHashes(roseHashA) // => [roseHashA, roseHashB, roseHashAdept, ...]
```

## Where it's wired in (done)

- **Rolls display** (`app/api/roulette/rolls/route.ts`) — every owned variant of a
  loadout weapon is bucketed under that slot, so a player sees ALL their rolls of
  the gun, not just the exact rolled hash. (Fixed #68.)
- **Equip** (`app/api/apply/route.ts → findBestInstance`) — an explicitly chosen
  instance is honored regardless of its hash, and otherwise any owned variant of
  the rolled weapon is a valid candidate. So a teammate with a different release
  still equips their copy.

## What's NOT done yet (#81)

The **intersection** (`app/api/roulette/intersection/route.ts`) still matches by
exact `itemHash`. That means a weapon only enters the shared pool — and becomes
rollable — when every member owns the *same* hash. To fully pool, the
intersection should include a weapon-group when every member owns *some* variant,
then store a representative hash for the roll.

This was deliberately split out: it changes what gets rolled (game-critical) and
needs the app run locally to verify, which the headless dev env can't do.

## Gotcha

Grouping is name-based, so a weapon must exist in `weapons-table.json` for its
variants to pool. Brand-new weapons missing from the static table won't group
until the table is regenerated (see the scheduled refresh in
`.github/workflows/refresh-weapons.yml`).
