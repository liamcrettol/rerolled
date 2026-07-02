// Regenerates the prebuilt weapon + perk tables from Bungie's manifest.
//
// The full DestinyInventoryItemDefinition is ~190 MB, so we never load it at
// runtime - this script extracts the compact tables the app ships with:
//   lib/bungie/data/weapons-table.json  (weapons only, with season watermarks)
//   lib/bungie/data/perk-names.json     (plug/perk hash -> display name)
//   lib/bungie/data/manifest-version.txt (the Bungie manifest version)
//
// It exits early (no download) when the committed manifest version already
// matches Bungie's current version, so scheduled runs are cheap.
//
// Run locally:  node scripts/build-weapons-table.mjs
// The Bungie manifest version endpoint and the JSON world content are public
// (no API key needed); if BUNGIE_API_KEY is set it is sent as a courtesy.

import { writeFileSync, readFileSync, existsSync } from "node:fs";

const PLATFORM = "https://www.bungie.net/Platform/Destiny2/Manifest/";
const CDN = "https://www.bungie.net";
const DATA_DIR = "lib/bungie/data";

const AMMO_TYPE_NAMES = { 1: "Primary", 2: "Special", 3: "Heavy" };
const WEAPON_STAT_HASHES = {
  4284893193: "RPM",
  4043523819: "Impact",
  1240592695: "Range",
  155624089: "Stability",
  943549884: "Handling",
  4188031367: "Reload",
  1345609583: "Aim Assist",
  3871231066: "Magazine",
  2961396640: "Charge Time",
  1931675084: "Inventory",
  3555269338: "Zoom",
};

// Comprehensive stat hash -> label map for perk investment stats.
const PERK_STAT_HASHES = {
  4284893193: "RPM",
  4043523819: "Impact",
  1240592695: "Range",
  3614673599: "Blast Radius",
  2523465841: "Velocity",
  155624089: "Stability",
  943549884: "Handling",
  4188031367: "Reload",
  1345609583: "Aim Assist",
  3555269338: "Zoom",
  3871231066: "Magazine",
  2961396640: "Charge Time",
  447667954: "Draw Time",
  2837207746: "Swing Speed",
  3022301683: "Charge Rate",
  1842278586: "Shield Duration",
  209426660: "Guard Resistance",
  2762071195: "Guard Efficiency",
};
const TIER_NAMES = { 6: "Exotic", 5: "Legendary", 4: "Rare" };
const DAMAGE_TYPE_NAMES = {
  3373582085: "Kinetic",
  1847026933: "Solar",
  2303181850: "Arc",
  3454344768: "Void",
  151347233: "Stasis",
  3949783978: "Strand",
};

function apiHeaders() {
  return process.env.BUNGIE_API_KEY ? { "X-API-Key": process.env.BUNGIE_API_KEY } : {};
}

async function main() {
  const manifestRes = await fetch(PLATFORM, { headers: apiHeaders() });
  if (!manifestRes.ok) throw new Error(`Manifest endpoint ${manifestRes.status}`);
  const manifest = await manifestRes.json();
  const version = manifest.Response.version;
  const itemPath = manifest.Response.jsonWorldComponentContentPaths.en.DestinyInventoryItemDefinition;

  const versionFile = `${DATA_DIR}/manifest-version.txt`;
  const current = existsSync(versionFile) ? readFileSync(versionFile, "utf8").trim() : "";
  if (current === version) {
    console.log(`Up to date (manifest ${version}); nothing to do.`);
    return;
  }

  console.log(`New manifest ${version} (was ${current || "none"}); downloading item table...`);
  const itemsRes = await fetch(`${CDN}${itemPath}`);
  if (!itemsRes.ok) throw new Error(`Item table download ${itemsRes.status}`);
  const all = await itemsRes.json();

  // Plug categories that are cosmetic / non-perk and should never show up as a
  // weapon "perk" (shaders, ornaments, masterworks, mods, trackers, etc.).
  const COSMETIC_PLUG = /shader|ornament|skins|masterwork|tracker|memento|\bmod|projection|ghost|empty|catalyst/i;
  // The catalyst's actual perk (e.g. "Ace of Spades Catalyst") has its own
  // plugCategoryIdentifier matching the "masterwork" keyword above (Bungie
  // categorizes it as a masterwork-upgrade plug), so it'd otherwise be
  // dropped by COSMETIC_PLUG. Collected in the first pass below and
  // exempted from that exclusion in the second.
  const EMPTY_CATALYST_SOCKET = "v400.empty.exotic.masterwork";

  const weapons = {};
  const perkNames = {};
  const perkData = {};
  const perkIcons = {};
  const catalystPerkHashes = new Set();

  // A weapon's first socket is always its intrinsic frame/archetype plug
  // (plugCategoryIdentifier "intrinsics") - "Rapid-Fire Frame" for a
  // legendary, or the exotic's unique named mechanic (e.g. "Vexadecimal" on
  // Deterministic Chaos). Verified 100% coverage across the current table.
  function intrinsicPerkHashOf(def) {
    const h = def.sockets?.socketEntries?.[0]?.singleInitialItemHash;
    if (!h) return null;
    const plug = all[h];
    return plug?.plug?.plugCategoryIdentifier === "intrinsics" ? h : null;
  }

  // An exotic's catalyst socket has a consistent marker: its *default* plug
  // (before the catalyst is unlocked) is always "Empty Catalyst Socket",
  // categoryIdentifier EMPTY_CATALYST_SOCKET. That socket's first reusable
  // plug is the real catalyst perk. Verified against every current exotic:
  // 99/146 have one (the other 47 are exotics that never got a catalyst -
  // MIDA, Sweet Business, Telesto, etc. - not a detection miss).
  // Legendaries never have this socket, so both fields stay null for them.
  function catalystOf(def) {
    const entries = def.sockets?.socketEntries ?? [];
    for (let i = 0; i < entries.length; i++) {
      const plug = all[entries[i].singleInitialItemHash];
      if (plug?.plug?.plugCategoryIdentifier === EMPTY_CATALYST_SOCKET) {
        const perkHash = entries[i].reusablePlugItems?.[0]?.plugItemHash ?? null;
        return { socketIndex: i, perkHash };
      }
    }
    return { socketIndex: null, perkHash: null };
  }

  // Pass 1: weapons + which perk hashes are actually catalyst perks (needed
  // before pass 2 decides what the cosmetic-plug filter should exclude).
  for (const key in all) {
    const def = all[key];
    if (def.itemType !== 3) continue;

    const stats = {};
    const ss = def.stats?.stats ?? {};
    for (const h in ss) {
      const label = WEAPON_STAT_HASHES[Number(h)];
      if (label) stats[label] = ss[h].value;
    }
    const wm = def.iconWatermark || def.iconWatermarkShelved || "";
    const catalyst = catalystOf(def);
    if (catalyst.perkHash) catalystPerkHashes.add(catalyst.perkHash);
    weapons[key] = {
      itemHash: Number(key),
      name: def.displayProperties?.name ?? "Unknown",
      icon: def.displayProperties?.icon ? CDN + def.displayProperties.icon : "",
      watermark: wm ? CDN + wm : undefined,
      weaponType: def.itemTypeDisplayName ?? "Weapon",
      ammoType: AMMO_TYPE_NAMES[def.equippingBlock?.ammoType ?? 1] ?? "Primary",
      damageType: DAMAGE_TYPE_NAMES[def.defaultDamageTypeHash ?? 0] ?? "Kinetic",
      tierName: TIER_NAMES[def.inventory?.tierType ?? 5] ?? "Legendary",
      tierType: def.inventory?.tierType ?? 5,
      flavorText: def.flavorText ?? "",
      defaultBucketHash: def.inventory?.bucketTypeHash ?? 0,
      collectibleHash: def.collectibleHash ?? undefined,
      stats,
      intrinsicPerkHash: intrinsicPerkHashOf(def),
      catalystSocketIndex: catalyst.socketIndex,
      catalystPerkHash: catalyst.perkHash,
    };
  }

  // Pass 2: socket plugs (weapon perks live here) -> name + description
  // lookup. Skip cosmetic plugs (shaders/ornaments/mods/etc.) so they never
  // render as weapon perks - except catalyst perks, which get swept up by
  // the same "masterwork" keyword match but are real gameplay data.
  for (const key in all) {
    const def = all[key];
    if (!def.plug || !def.displayProperties?.name) continue;
    const pcid = def.plug.plugCategoryIdentifier || "";
    if (COSMETIC_PLUG.test(pcid) && !catalystPerkHashes.has(Number(key))) continue;
    perkNames[key] = def.displayProperties.name;
    const investStats = {};
    for (const is of (def.investmentStats ?? [])) {
      const label = PERK_STAT_HASHES[is.statTypeHash];
      if (label && is.value !== 0) investStats[label] = is.value;
    }
    perkData[key] = {
      n: def.displayProperties.name,
      d: def.displayProperties.description || "",
      ...(Object.keys(investStats).length > 0 ? { s: investStats } : {}),
    };
    if (def.displayProperties?.icon) {
      perkIcons[key] = CDN + def.displayProperties.icon;
    }
  }

  writeFileSync(`${DATA_DIR}/weapons-table.json`, JSON.stringify(weapons));
  writeFileSync(`${DATA_DIR}/perk-names.json`, JSON.stringify(perkNames));
  writeFileSync(`${DATA_DIR}/perk-data.json`, JSON.stringify(perkData));
  writeFileSync(`${DATA_DIR}/perk-icons.json`, JSON.stringify(perkIcons));
  writeFileSync(versionFile, version + "\n");

  console.log(
    `Wrote ${Object.keys(weapons).length} weapons, ${Object.keys(perkData).length} perks with ${Object.keys(perkIcons).length} icons (manifest ${version}).`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
