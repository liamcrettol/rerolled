# Light/Power Logo + Icon Assets Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the incorrect Light/Power glyph in the character picker with a power-button symbol, and repair the four corrupted `public/icons` assets (Vercel checkpoint HTML saved as `.svg`).

**Architecture:** Three independent changes. (1) A Node-environment Jest regression test asserts every file in `public/icons/` is a real SVG — this is written first and fails against the current corrupt files. (2) The four corrupt files are replaced with valid hand-authored SVGs, turning the test green. (3) The `LightLevelIcon` inline SVG in `components/LobbyRoom.tsx` is swapped from a sun/sparkle to a power-button glyph (manual visual verification — a pure presentational swap).

**Tech Stack:** Next.js, React, TypeScript, Jest + ts-jest (`testEnvironment: jest-environment-node`), Tailwind CSS. Tests run with `npm test`; lint with `npm run lint`.

**Spec:** `docs/superpowers/specs/2026-06-24-light-logo-and-icon-assets-design.md`

---

## File Structure

- **Create** `__tests__/public-icons.test.ts` — regression test: every `public/icons/*.svg` is a valid SVG, not the checkpoint HTML page. Owns the guard against the corruption root cause.
- **Replace** `public/icons/class-titan.svg`, `public/icons/class-hunter.svg`, `public/icons/class-warlock.svg`, `public/icons/destiny-default.svg` — valid monochrome SVG fallback glyphs consumed by `EmblemThumbnail`.
- **Modify** `components/LobbyRoom.tsx` (`LightLevelIcon`, ~line 202) — swap inline sun/sparkle SVG for a power-button glyph.

No other files change. `EmblemThumbnail`, `CLASS_ICON_PATHS`, the Bungie emblem path, and all API code are untouched.

---

## Task 1: Regression test for valid SVG assets

**Files:**
- Create: `__tests__/public-icons.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/public-icons.test.ts`:

```ts
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const ICONS_DIR = join(process.cwd(), "public", "icons");

const svgFiles = readdirSync(ICONS_DIR).filter((f) => f.endsWith(".svg"));

describe("public/icons SVG assets", () => {
  it("contains SVG files to validate", () => {
    expect(svgFiles.length).toBeGreaterThan(0);
  });

  it.each(svgFiles)(
    "%s is a real SVG, not an HTML checkpoint page",
    (file) => {
      const content = readFileSync(join(ICONS_DIR, file), "utf8").trimStart();

      // Guards against the root-cause corruption: svgrepo's Vercel
      // Security Checkpoint HTML page saved with a .svg extension.
      expect(content).not.toMatch(/^<!doctype html/i);
      expect(content).not.toContain("Vercel Security Checkpoint");

      // Must actually be an SVG document.
      expect(content).toMatch(/^(<\?xml[^>]*\?>\s*)?<svg[\s>]/i);
    }
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest __tests__/public-icons.test.ts`
Expected: FAIL. The four current files begin with `<!DOCTYPE html>` and contain "Vercel Security Checkpoint", so the `not.toMatch`/`not.toContain`/`toMatch` assertions fail for `class-titan.svg`, `class-hunter.svg`, `class-warlock.svg`, and `destiny-default.svg`.

- [ ] **Step 3: Commit the failing test**

```bash
git add __tests__/public-icons.test.ts
git commit -m "test: assert public/icons assets are valid SVGs (#65)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Replace the four corrupted SVG assets

**Files:**
- Modify (overwrite): `public/icons/class-titan.svg`
- Modify (overwrite): `public/icons/class-hunter.svg`
- Modify (overwrite): `public/icons/class-warlock.svg`
- Modify (overwrite): `public/icons/destiny-default.svg`
- Test: `__tests__/public-icons.test.ts` (from Task 1)

> These are simplified, recognizable class-themed glyphs — not pixel-exact Bungie
> assets (the manifest has no class icons; svgrepo cannot be downloaded here).
> Light gray fill (`#e5e7eb`) on a transparent background, sized to render at the
> 32px (`w-8 h-8`) thumbnail used by `EmblemThumbnail`.

- [ ] **Step 1: Overwrite `public/icons/class-titan.svg`** (stacked chevrons — strength/defense crest)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="#e5e7eb" role="img" aria-label="Titan">
  <path d="M32 6 8 24v9l24-18 24 18v-9z"/>
  <path d="M32 24 8 42v9l24-18 24 18v-9z"/>
  <path d="M32 42 14 55.5v.5l18-13.5L50 56v-.5z"/>
</svg>
```

- [ ] **Step 2: Overwrite `public/icons/class-hunter.svg`** (hood/cowl with pointed base)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="#e5e7eb" role="img" aria-label="Hunter">
  <path d="M32 6 6 22l9 6 17-10 17 10 9-6z"/>
  <path d="M17 31v13l15 14 15-14V31L32 41z"/>
</svg>
```

- [ ] **Step 3: Overwrite `public/icons/class-warlock.svg`** (winged crest over a central point)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="#e5e7eb" role="img" aria-label="Warlock">
  <path d="M32 8 21 27h22z"/>
  <path d="M7 25l14 5-7 9z"/>
  <path d="M57 25 43 30l7 9z"/>
  <path d="M19 33l13 23 13-23-13 6z"/>
</svg>
```

- [ ] **Step 4: Overwrite `public/icons/destiny-default.svg`** (neutral guardian shield)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="#e5e7eb" role="img" aria-label="Guardian">
  <path d="M32 6 10 14v17c0 14 9 23 22 27 13-4 22-13 22-27V14z"/>
</svg>
```

- [ ] **Step 5: Run the regression test to verify it passes**

Run: `npx jest __tests__/public-icons.test.ts`
Expected: PASS. All four files now begin with `<svg`, contain no checkpoint markup.

- [ ] **Step 6: Commit**

```bash
git add public/icons/class-titan.svg public/icons/class-hunter.svg public/icons/class-warlock.svg public/icons/destiny-default.svg
git commit -m "fix: replace corrupted icon assets with valid SVGs (#65)

The four files were Vercel Security Checkpoint HTML pages saved with a
.svg extension (downloaded through svgrepo's anti-bot block). Replace
with valid monochrome SVG fallback glyphs.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Replace the Light/Power glyph with a power-button symbol

**Files:**
- Modify: `components/LobbyRoom.tsx` (`LightLevelIcon`, lines 202-212)

> No automated unit test: this is a presentational SVG swap. The `LightLevelIcon`
> signature (`{ light: number }`) and all surrounding classes are unchanged.
> Verified visually in Step 3.

- [ ] **Step 1: Replace the `LightLevelIcon` body**

In `components/LobbyRoom.tsx`, replace this exact block (lines 202-212):

```tsx
function LightLevelIcon({ light }: { light: number }) {
  return (
    <span className="flex items-center gap-1">
      <svg viewBox="0 0 24 24" className="w-4 h-4 text-yellow-400" fill="currentColor">
        <circle cx="12" cy="12" r="2" />
        <path d="M12 1v6m0 4v6M1 12h6m4 0h6M3.22 3.22l4.24 4.24m5.08 0l4.24-4.24M3.22 20.78l4.24-4.24m5.08 0l4.24 4.24" stroke="currentColor" strokeWidth="1.5" fill="none" />
      </svg>
      <span>{light}</span>
    </span>
  );
}
```

with:

```tsx
function LightLevelIcon({ light }: { light: number }) {
  return (
    <span className="flex items-center gap-1">
      {/* Power-button glyph: a circle broken at the top with a vertical line through it. */}
      <svg
        viewBox="0 0 24 24"
        className="w-4 h-4 text-yellow-400"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
        <line x1="12" y1="2" x2="12" y2="12" />
      </svg>
      <span>{light}</span>
    </span>
  );
}
```

- [ ] **Step 2: Verify it compiles / lints**

Run: `npm run lint`
Expected: No new errors for `components/LobbyRoom.tsx`.

- [ ] **Step 3: Manual visual verification**

Run: `npm run dev`, open the app, join/create a lobby until the "Your Character" picker renders.
Expected: each guardian button shows a yellow **power-button** glyph (broken-circle + top line) immediately before the Light value (e.g. `⏻ 1810`) — not the old sun/sparkle. The class emblem thumbnail still renders to its left.

- [ ] **Step 4: Commit**

```bash
git add components/LobbyRoom.tsx
git commit -m "fix: use power-button glyph for Light/Power in character picker (#65)

Closes #65

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS, including `__tests__/public-icons.test.ts` and the existing `lib/bungie/__tests__/equip.test.ts`.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: No new errors.

- [ ] **Step 3: Production build sanity check**

Run: `npm run build`
Expected: Build completes without errors.

---

## Self-Review Notes

- **Spec coverage:** Light glyph swap → Task 3. Corrupt asset replacement → Task 2. Regression test → Task 1. Full verification → Task 4. All spec sections covered.
- **Out of scope respected:** No changes to `EmblemThumbnail`, `CLASS_ICON_PATHS`, emblem path, or API code.
- **Type consistency:** `LightLevelIcon({ light }: { light: number })` signature unchanged; only the JSX body changes.
- **Closing keyword:** `Closes #65` appears in the Task 3 commit (the headline fix) so the issue auto-closes on merge.
