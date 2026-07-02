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

## Exotic catalysts (#192)

`COSMETIC_PLUG` in `build-weapons-table.mjs` filters shaders, ornaments,
masterworks, trackers, and mods out of `perk-data.json` so they never render
as a weapon "perk" — this is mostly right (nobody wants a shader showing up
as a "perk"), except a catalyst's actual perk plug gets swept up by the same
`masterwork` keyword match (Bungie categorizes it as a masterwork-upgrade
plug). The build script runs in two passes to work around this: pass one
builds weapons and, for each exotic, finds the socket whose *default* plug is
"Empty Catalyst Socket" (`plugCategoryIdentifier ===
"v400.empty.exotic.masterwork"`) — a reliable marker verified across all 146
exotics (99 have one; the other 47, like MIDA and Telesto, never got a
catalyst). That socket's first reusable plug is the real catalyst perk hash,
collected into a set; pass two exempts those specific hashes from the
cosmetic-plug exclusion.

Catalyst **unlock state** is per-instance (each player's own copy), so it
can't live in the static table — `rolls/route.ts` reads it live by comparing
the specific socket's current `plugHash` against the known catalyst hash for
that weapon. Shown in `RollDetails.tsx`'s icon row next to the intrinsic
frame perk, only when that instance has it unlocked.

## Known-fragile: hardcoded socket indices (#193)

`rolls/route.ts` reads `barrelHash`/`magazineHash`/`masterworkHash` from
fixed socket indices (1, 2, 6) for every weapon, which doesn't hold across
all weapon types. A full audit found 186 distinct socket layouts across the
current table, and a large fraction of weapons have no default plug at those
positions at the definition level at all (randomized perks only resolve from
live instance data, not the static manifest) — so a "just compute the right
fixed index per weapon" fix isn't sufficient either. Left open rather than
risking a fix that can't be tested against real inventory data.
