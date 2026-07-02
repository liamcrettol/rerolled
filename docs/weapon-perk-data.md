# Weapon/perk data pipeline

The app never touches the live Bungie manifest at request time — it's ~190 MB,
which times out / OOMs a serverless function trying to download and parse it
inline. Instead `lib/bungie/data/*.json` ships a compact prebuilt set of tables
that `lib/bungie/definitions.ts` loads as instant in-memory maps.

## Regenerating

```bash
node scripts/build-weapons-table.mjs   # weapons + perk names/descriptions/icons
node scripts/sync-clarity-data.mjs     # community perk-stat overlay (run second — filters against perk-data.json)
```

`.github/workflows/refresh-weapons.yml` runs both every Tuesday (after weekly
reset) and on manual dispatch, committing `lib/bungie/data/*.json` only if
something actually changed.

## Intrinsic frame / archetype perk

`WeaponDefinition.intrinsicPerkHash` is a legendary's frame (e.g. "Rapid-Fire
Frame") or an exotic's unique named mechanic (e.g. Deterministic Chaos's
"Vexadecimal") — the perk that's the weapon's whole reason for existing, as
opposed to its swappable column perks.

It's extracted in `build-weapons-table.mjs` from the weapon's **first socket**,
where the resolved plug's `plugCategoryIdentifier === "intrinsics"`. This holds
for 100% of the current weapon table (2208/2208) — every weapon, legendary or
exotic, has its frame/archetype plug in that exact position. Resolved through
the normal perk-info pipeline and shown next to the weapon name in
`components/RollDetails.tsx`. (#191)

## Community perk-stat data (Clarity)

Bungie's manifest doesn't expose exact numbers for a lot of perk/exotic
behavior — PvP-tuned values, percentages, durations. That's only ever present
as tooltip flavor text (or not present at all). `scripts/sync-clarity-data.mjs`
fills this gap from the [Clarity database](https://github.com/Database-Clarity/Live-Clarity-Database),
the same community-maintained source D2Foundry, DIM, and light.gg use.

- Downloads `descriptions/lightGG.json`, flattens its segmented text format to
  plain strings, and keeps only entries whose hash already exists in
  `perk-data.json` (this app is weapon-only, so armor mods/subclass
  fragments/abilities in the source data would just be dead weight).
- Writes `lib/bungie/data/perk-clarity.json`, surfaced as
  `PerkInfo.communityDescription` in `definitions.ts`.
- Rendered in `components/PerkIcon.tsx` with a **"Perk data: Clarity"**
  attribution line — required by
  [Clarity's usage terms](https://www.d2clarity.com/partnerships) (free for
  projects under ~150 users provided the data is credited; past that, they
  want a licensing conversation). **Don't strip this credit.** (#190)

## What's excluded (and why)

`COSMETIC_PLUG` in `build-weapons-table.mjs` filters shaders, ornaments,
masterworks, trackers, mods, and **catalysts** out of `perk-data.json` so they
never render as a weapon "perk". This is mostly right (nobody wants a shader
showing up as a "perk"), but it also means **catalyst bonus effects aren't in
the static tables at all**, even though Clarity has the numbers for them (153
"Weapon Catalyst Exotic" entries). Catalyst state also isn't read anywhere in
the live inventory/equip pipeline (`app/api/roulette/rolls/route.ts`'s
`PERK_SOCKET_INDICES` doesn't include a catalyst socket). Surfacing catalysts
is tracked as a separate, bigger piece of work — see #192.
