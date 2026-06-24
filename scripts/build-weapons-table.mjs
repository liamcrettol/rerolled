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

  const weapons = {};
  const perkNames = {};
  const perkIcons = {};
  for (const key in all) {
    const def = all[key];

    if (def.itemType === 3) {
      const stats = {};
      const ss = def.stats?.stats ?? {};
      for (const h in ss) {
        const label = WEAPON_STAT_HASHES[Number(h)];
        if (label) stats[label] = ss[h].value;
      }
      const wm = def.iconWatermark || def.iconWatermarkShelved || "";
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
        intrinsicPerk: def.itemTypeDisplayName ?? null,
      };
    }

    // Socket plugs (weapon perks live here) -> name lookup
    if (def.plug && def.displayProperties?.name) {
      perkNames[key] = def.displayProperties.name;
      if (def.displayProperties?.icon) {
        perkIcons[key] = CDN + def.displayProperties.icon;
      }
    }
  }

  writeFileSync(`${DATA_DIR}/weapons-table.json`, JSON.stringify(weapons));
  writeFileSync(`${DATA_DIR}/perk-names.json`, JSON.stringify(perkNames));
  writeFileSync(`${DATA_DIR}/perk-icons.json`, JSON.stringify(perkIcons));
  writeFileSync(versionFile, version + "\n");

  console.log(
    `Wrote ${Object.keys(weapons).length} weapons, ${Object.keys(perkNames).length} perks with ${Object.keys(perkIcons).length} icons (manifest ${version}).`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
