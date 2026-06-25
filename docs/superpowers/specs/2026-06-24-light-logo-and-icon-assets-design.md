# Design: Fix Light/Power logo + corrupted icon assets (#65)

**Issue:** [#65 — Bug: Fix light logo on character selection](https://github.com/liamcrettol/destiny-gun-roulette/issues/65)
**Date:** 2026-06-24

## Problem

On the character picker inside the "Your Character" component, the Light/Power
indicator is incorrect. Two distinct defects share investigation here:

1. **Light/Power glyph.** `LightLevelIcon` (`components/LobbyRoom.tsx:202`)
   renders an inline SVG sun/sparkle (a center dot with radiating rays). It does
   not read as a Destiny Light/Power stat.

2. **Corrupted icon assets.** All four files in `public/icons/`
   (`class-titan.svg`, `class-hunter.svg`, `class-warlock.svg`,
   `destiny-default.svg`) are not SVGs. Each is a 33 KB Vercel Security
   Checkpoint HTML page (`<!DOCTYPE html>…`) saved with a `.svg` extension. They
   have been corrupt since their first commit (`ed15ed8`).

### Root cause

The assets were "downloaded" from svgrepo.com, which sits behind a Vercel
Security Checkpoint that serves an anti-bot HTML page to automated requests. The
download captured that page instead of the SVG. The svgrepo link in the issue is
behind the same checkpoint, so a programmatic re-download would reproduce the
corruption.

## Research: can these come from the Bungie API?

Verified empirically against the live manifest (`BUNGIE_API_KEY`):

- **Class symbols — not available.** `DestinyClassDefinition` for Titan, Hunter,
  and Warlock all report `hasIcon=False` / `icon=None`. The manifest has no class
  icon. This is why local files exist. Class icons must remain local assets.
- **Light/Power — available but unsuitable.** The Power stat (`1935470627`)
  exposes `icon=/common/destiny2_content/icons/717b8b218cc14325a54869bef21d2964.png`
  on `bungie.net` (fetchable; not checkpoint-blocked). However it is a fixed
  51×51 **white PNG** of the in-game power glyph. It cannot take the
  `text-yellow-400` tint (currentColor does not apply to a raster image), it is a
  different look than the chosen glyph, and it adds a manifest lookup / hardcoded
  CDN URL for a static glyph. Rejected in favor of an inline SVG.

## Decisions

- **Glyph:** the standard power-button (IEC) symbol — a circle broken at the top
  with a vertical line through it (svgrepo "power2" style).
- **Light icon sourcing:** inline SVG inside `LightLevelIcon`. Recolorable via
  `currentColor`, no network dependency, no corruption risk.
- **Class icon sourcing:** local SVG files, hand-authored (svgrepo cannot be
  downloaded here). Simplified, recognizable class glyphs — not pixel-exact
  Bungie assets.

## Changes

### 1. `LightLevelIcon` — `components/LobbyRoom.tsx:202`

Replace the inline sun/sparkle `<svg>` paths with the power-button glyph. Keep
everything else unchanged: `w-4 h-4`, `text-yellow-400`, `fill="currentColor"`,
`viewBox="0 0 24 24"`, and the adjacent `{light}` value. Pure presentational
swap; the component signature (`{ light: number }`) does not change.

### 2. `public/icons/*.svg` — replace all four corrupt files

Author valid monochrome SVGs that render cleanly at 32 px (`w-8 h-8`) on the dark
bungie surface (light fill, no embedded background):

- `class-titan.svg`, `class-hunter.svg`, `class-warlock.svg` — simplified,
  visually distinct class glyphs.
- `destiny-default.svg` — a generic guardian fallback mark.

These are consumed as `<img src>` fallbacks in `EmblemThumbnail`
(`components/LobbyRoom.tsx:168`) when the API emblem path is missing or fails to
load. No change to `EmblemThumbnail` logic, `CLASS_ICON_PATHS`, the Bungie emblem
path, or any API sourcing.

## Testing

- **Regression test (primary value).** Add a test in the existing
  `__tests__` style that asserts every file in `public/icons/` is a real SVG:
  content begins with `<svg` (after optional XML/whitespace prolog) and is **not**
  the `<!DOCTYPE html>` checkpoint page. This directly prevents the corruption
  root cause from recurring.
- **Manual verification.** Run the app and confirm the character picker shows the
  power-button glyph beside each guardian's Light value, and that the class-icon
  fallback renders when an emblem is unavailable.

## Out of scope

- `EmblemThumbnail` fallback logic and the Bungie emblem path.
- Any runtime API sourcing of icons.
- Pixel-exact reproduction of official Bungie class symbols.
