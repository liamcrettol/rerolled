// Fills in perk numbers Bungie's manifest doesn't expose (exotic perk
// percentages/durations, PvP-tuned values, other behavior that only exists as
// tooltip flavor text) from the community-run Clarity database - the same
// source D2Foundry, DIM, and light.gg use for this.
//
// Source: https://github.com/Database-Clarity/Live-Clarity-Database
// Usage terms (https://www.d2clarity.com/partnerships): free for hobbyist
// projects under ~150 users provided the data is credited - see the "Perk
// data: Clarity" credit in RollDetails.tsx. Don't strip that attribution.
//
// Only keeps entries for perk hashes we already track in perk-data.json (this
// app is weapon-only, so armor mods/abilities/etc. in the source data would
// just be dead weight). Writes lib/bungie/data/perk-clarity.json.
//
// Run locally:  node scripts/sync-clarity-data.mjs

import { writeFileSync, readFileSync } from "node:fs";

const SOURCE_URL =
  "https://raw.githubusercontent.com/Database-Clarity/Live-Clarity-Database/live/descriptions/lightGG.json";
const DATA_DIR = "lib/bungie/data";

// Flattens Clarity's segmented description (an array of line blocks, each
// with text/icon-marker segments) into plain text. Icon-marker segments
// (elemental icons etc.) carry no text and are dropped; "spacer" blocks
// become a blank line.
function extractText(enBlocks) {
  if (typeof enBlocks === "string") return enBlocks.trim();
  if (!Array.isArray(enBlocks)) return "";
  const lines = enBlocks.map((block) => {
    if (block.classNames?.includes("spacer")) return "";
    if (!Array.isArray(block.linesContent)) return "";
    return block.linesContent.map((seg) => seg.text ?? "").join("");
  });
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function main() {
  const knownPerks = JSON.parse(readFileSync(`${DATA_DIR}/perk-data.json`, "utf8"));

  console.log("Downloading Clarity database...");
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Clarity database download ${res.status}`);
  const all = await res.json();

  const clarity = {};
  for (const key in all) {
    if (!(key in knownPerks)) continue;
    const text = extractText(all[key].descriptions?.en);
    if (text) clarity[key] = text;
  }

  writeFileSync(`${DATA_DIR}/perk-clarity.json`, JSON.stringify(clarity));
  console.log(`Wrote ${Object.keys(clarity).length} Clarity entries (of ${Object.keys(all).length} in source).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
