# Best Rolls dataset

Crowd-sourced "best roll per archetype" data for the group, feeding a future
in-app highlight on the Roll Comparison screen.

## Files

- **`best-rolls-template.xlsx`** — the blank starter sheet (no entries). Used
  to seed a fresh Google Sheets import if the live one ever needs to be
  recreated. One row per weapon archetype (94 rows: e.g. Hand Cannon /
  Adaptive Frame, Shotgun / Aggressive Frame). Barrel/Magazine/Perk 1/Perk
  2/Origin columns are dropdowns scoped to exactly what that archetype can
  actually roll — see the "Instructions" tab in the workbook.
- **`best-rolls-current.xlsx`** — periodic snapshot of the live, group-edited
  Google Sheet (downloaded and dropped in here by hand for now — see
  "Automating the sync" below). This is the one with actual submitted rolls
  in it.
- **`archetype-perk-pools.json`** — the raw per-archetype perk pools pulled
  from Bungie's live manifest. This is what the dropdowns are generated from,
  and later becomes the source data for matching a rolled weapon to its
  archetype in-app.
- **`fix-dropdowns.gs`** — standalone Apps Script (paste into script.google.com,
  set `SHEET_ID`, run `fixDropdowns`) that rebuilds the archetype-scoped
  dropdowns and Priority Stat 1/2 validation directly in Sheets. Needed
  because Excel's `INDIRECT`-based dependent dropdowns don't survive the
  xlsx → Sheets import.
- **`best-rolls.json`** — `best-rolls-current.xlsx`'s "Best Rolls" sheet
  converted to JSON, keyed by `"<Weapon Type>|<Frame / Archetype>"` (e.g.
  `"Hand Cannon|Precision Frame"`). This is what the app actually imports
  (via `lib/bestRolls.ts`) to badge a rolled instance that matches the
  curated roll in `components/RollDetails.tsx`. Regenerate by re-running the
  conversion (ask Claude - it's a short one-off script, not checked in since
  this step is still manual per the workflow below) whenever
  `best-rolls-current.xlsx` is updated. **Don't hand-edit `best-rolls.json`.**

⚠️ **Current data is a provisional v1 baseline, not verified group
consensus.** The July 2026 import had every row filled with a suspiciously
uniform auto-generated-looking "Notes" template and no `Submitted By` values,
despite the Instructions tab asking for both - it wasn't produced by the
"everyone fills out rows they have opinions on" process below. Treat the
in-app "Best roll pick (unverified)" badge accordingly until real
group-reviewed data replaces it.

## Regenerating the pool data

Weapon archetypes and their perk pools change with each expansion/season.
Regenerate before re-issuing the template:

```bash
node scripts/build-archetype-pools.mjs
```

This overwrites `archetype-perk-pools.json` from the current Bungie manifest.
Re-run the spreadsheet build after (script not yet checked in — ask Claude to
regenerate `best-rolls-template.xlsx` from the updated JSON) so the dropdowns
stay in sync. **Don't hand-edit `archetype-perk-pools.json`.**

## Workflow

1. Everyone fills out rows in the live Google Sheet for archetypes they have
   opinions on (no need to complete all 94 — partial is fine).
2. Periodically, download the Sheet as `.xlsx` and drop it in here as
   `best-rolls-current.xlsx` (overwrite) so the repo has a record of it.
3. It gets converted to `best-rolls.json` (see above) and imported into the
   app via `lib/bestRolls.ts`, which `app/api/roulette/rolls/route.ts` uses
   to badge a rolled instance that matches the curated "ideal" perk combo in
   `components/RollDetails.tsx`. Wired up as of #184's follow-up - currently
   running on the provisional v1 data called out above.

## Automating the sync (not yet built)

Right now step 2 above is manual (download from Sheets, hand the file to
Claude). Could be automated with a scheduled GitHub Action that reads the
Sheet via the Google Sheets API and auto-commits `best-rolls-current.xlsx`
(or a converted JSON) when it changes — worth doing once the sheet has real
data and the manual download gets annoying.
