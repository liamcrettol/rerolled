#!/usr/bin/env node
/**
 * Deploy the current working tree to the stable preview environment.
 *
 * Vercel does NOT auto-deploy branch pushes for this project (it only builds
 * previews for branches with an open PR), so refreshing preview.d2roulette.app
 * is a manual two-step: deploy, then re-point the stable alias at the new build.
 * This script does both.
 *
 * Usage:  node scripts/deploy-preview.mjs
 *
 * Notes:
 *  - Deploys as a Preview (uses Preview-scoped env vars: the 2nd Bungie app,
 *    NEXTAUTH_URL=https://preview.d2roulette.app, etc.).
 *  - OAuth works on the preview because the alias keeps the URL stable and the
 *    preview Bungie app's redirect points at preview.d2roulette.app.
 */
import { execSync } from "node:child_process";

const ALIAS = "preview.d2roulette.app";

function run(cmd) {
  console.log(`\n$ ${cmd}`);
  return execSync(cmd, { encoding: "utf8", stdio: ["inherit", "pipe", "inherit"] });
}

console.log("→ Deploying current working tree to Vercel (preview)...");
const out = run("npx vercel deploy");
process.stdout.write(out);

const match = out.match(/https:\/\/destiny-gun-roulette-[a-z0-9]+-liamncrettol\.vercel\.app/);
if (!match) {
  console.error("\n✗ Could not parse the deployment URL from vercel output.");
  process.exit(1);
}
const url = match[0];

console.log(`\n→ Pointing ${ALIAS} at ${url}...`);
run(`npx vercel alias set ${url} ${ALIAS}`);

console.log(`\n✓ Done. Preview is live at https://${ALIAS} (build: ${url})`);
