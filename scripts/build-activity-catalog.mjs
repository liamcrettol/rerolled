// Regenerates the compact activity catalog used by Score Attack weekly picks.
//
// The app should never download the full Bungie activity manifest at runtime.
// This script runs in the scheduled data-refresh workflow and writes:
//   data/activities/activity-catalog.json
//
// Run locally: node scripts/build-activity-catalog.mjs

import { mkdirSync, writeFileSync } from "node:fs";

const PLATFORM = "https://www.bungie.net/Platform/Destiny2/Manifest/";
const CDN = "https://www.bungie.net";
const OUTPUT_PATH = "data/activities/activity-catalog.json";

const MODE_NAMES = new Map([
  [5, "All PvP"],
  [10, "Control"],
  [12, "Clash"],
  [13, "Crimson Doubles"],
  [15, "Mayhem"],
  [19, "Iron Banner"],
  [24, "Rumble"],
  [31, "Supremacy"],
  [37, "Survival"],
  [39, "Trials of Osiris"],
  [48, "Rift"],
  [59, "Showdown"],
  [60, "Elimination"],
  [63, "Momentum Control"],
]);

const PVP_MODE_TYPES = new Set(MODE_NAMES.keys());

const MANUAL_NAME_OVERRIDES = new Map([
  ["Trials of Osiris", { pillar: "pvp", kind: "trials" }],
  ["Iron Banner", { pillar: "pvp", kind: "iron-banner" }],
]);

function apiHeaders() {
  return process.env.BUNGIE_API_KEY ? { "X-API-Key": process.env.BUNGIE_API_KEY } : {};
}

function cleanName(name) {
  return String(name ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function isPlayable(def) {
  if (def.redacted) return false;
  if (def.blacklisted) return false;
  if (!def.displayProperties?.name) return false;
  if (!def.directActivityModeHash && !def.directActivityModeType && !(def.activityModeHashes ?? []).length) {
    return false;
  }
  return true;
}

function classifyByName(name) {
  const n = name.toLowerCase();
  if (n.includes("grandmaster")) return { pillar: "pve", kind: "grandmaster" };
  if (n.includes("nightfall")) return { pillar: "pve", kind: "grandmaster" };
  if (n.includes("raid")) return { pillar: "pve", kind: "raid" };
  if (n.includes("dungeon")) return { pillar: "pve", kind: "dungeon" };
  if (n.includes("trials of osiris")) return { pillar: "pvp", kind: "trials" };
  if (n.includes("iron banner")) return { pillar: "pvp", kind: "iron-banner" };
  return null;
}

function classifyByActivityType(def, activityTypes) {
  const typeName = cleanName(activityTypes[def.activityTypeHash]?.displayProperties?.name).toLowerCase();
  if (typeName.includes("raid")) return { pillar: "pve", kind: "raid" };
  if (typeName.includes("dungeon")) return { pillar: "pve", kind: "dungeon" };
  if (typeName.includes("nightfall")) return { pillar: "pve", kind: "grandmaster" };
  return null;
}

function modeTypesFor(def) {
  return new Set([
    def.directActivityModeType,
    ...(def.activityModeTypes ?? []),
  ].filter(Boolean));
}

function classifyActivity(def, activityTypes) {
  const name = cleanName(def.displayProperties?.name);
  const override = MANUAL_NAME_OVERRIDES.get(name);
  if (override) return override;

  const modeTypes = modeTypesFor(def);

  if (modeTypes.has(39)) return { pillar: "pvp", kind: "trials" };
  if (modeTypes.has(19)) return { pillar: "pvp", kind: "iron-banner" };

  for (const type of modeTypes) {
    if (PVP_MODE_TYPES.has(type)) return { pillar: "pvp", kind: "crucible" };
  }

  return classifyByActivityType(def, activityTypes) ?? classifyByName(name);
}

function canonicalName(def, classification) {
  const name = cleanName(def.displayProperties?.name);
  if (classification.pillar === "pvp") {
    for (const type of modeTypesFor(def)) {
      const modeName = MODE_NAMES.get(type);
      if (modeName && modeName !== "All PvP") return modeName;
    }
  }

  return name
    .replace(/^Grandmaster:\s*/i, "")
    .replace(/^Nightfall:\s*/i, "")
    .replace(/\s*:\s*Legend$/i, "")
    .replace(/\s*:\s*Master$/i, "")
    .trim();
}

async function main() {
  const manifestRes = await fetch(PLATFORM, { headers: apiHeaders() });
  if (!manifestRes.ok) throw new Error(`Manifest endpoint ${manifestRes.status}`);
  const manifest = await manifestRes.json();
  const version = manifest.Response.version;
  const paths = manifest.Response.jsonWorldComponentContentPaths.en;
  const activityPath = paths.DestinyActivityDefinition;
  const activityTypePath = paths.DestinyActivityTypeDefinition;

  const [activitiesRes, activityTypesRes] = await Promise.all([
    fetch(`${CDN}${activityPath}`),
    fetch(`${CDN}${activityTypePath}`),
  ]);
  if (!activitiesRes.ok) throw new Error(`Activity table download ${activitiesRes.status}`);
  if (!activityTypesRes.ok) throw new Error(`Activity type table download ${activityTypesRes.status}`);
  const [definitions, activityTypes] = await Promise.all([
    activitiesRes.json(),
    activityTypesRes.json(),
  ]);

  const grouped = new Map();
  for (const key in definitions) {
    const def = definitions[key];
    if (!isPlayable(def)) continue;

    const classification = classifyActivity(def, activityTypes);
    if (!classification) continue;

    const name = canonicalName(def, classification);
    if (!name || name === "Unknown") continue;

    const groupKey = `${classification.pillar}:${classification.kind}:${name.toLowerCase()}`;
    const existing = grouped.get(groupKey) ?? {
      name,
      pillar: classification.pillar,
      kind: classification.kind,
      activityHashes: [],
    };
    existing.activityHashes.push(Number(key));
    grouped.set(groupKey, existing);
  }

  const activities = [...grouped.values()]
    .map((activity) => ({
      ...activity,
      activityHashes: [...new Set(activity.activityHashes)].sort((a, b) => a - b),
    }))
    .sort((a, b) => a.pillar.localeCompare(b.pillar) || a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));

  mkdirSync("data/activities", { recursive: true });
  writeFileSync(
    OUTPUT_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: `bungie-manifest:${version}`,
        activities,
      },
      null,
      2
    ) + "\n"
  );

  console.log(`Wrote ${activities.length} activities from manifest ${version}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
