# mida.tools design brief

Instructions for restyling Rerolled, Replay and Rival as one minimalist family under the `mida.tools` domain. Read all of it before changing any UI.

Reference mockup: `mida-min.html` in this folder (open it at `http://localhost:4400/mida-min.html` with `python3 -m http.server 4400` from this folder; add `?theme=dark` for dark). When this brief and the mockup disagree, the brief wins.

## 1. The idea

The theme comes from the MIDA Multi-Tool, an exotic scout rifle in Destiny. Its in-game description reads like a tools menu: "Select application: Ballistic engagement. Entrenching tool. Avionics trawl... List continues." The weapon itself is matte black hardware with one small orange indicator light.

So the whole family is **quiet, precise and minimal**: plain type, lots of space, and a single orange signal used sparingly. The MIDA reference lives in two places only: the orange dot, and the "Select application." / "List continues." wording on the home page. Nothing else is themed.

## 2. Domains

| Site | Old address | New address |
|---|---|---|
| Hub (new) | none | `mida.tools` |
| Rerolled | `rerolled.io` | `rerolled.mida.tools` |
| Replay | `replay.rerolled.io` | `replay.mida.tools` |
| Rival | `rival.rerolled.io` | `rival.mida.tools` |

Keep the old domains redirecting (301) to the new ones. Bungie OAuth redirect URLs, Vercel domains, cookies and any hard-coded links must be updated per site. The UI restyle and the domain move are separate pieces of work; do not mix them in one change.

## 3. Hard rules (do not break these)

- **No decoration.** No stencil or display fonts, no glows, no LED or dot-matrix fonts, no textures, no tape, no spec plates, no radar graphics, no chamfered corners, no gradients, no shadows, no glass, no emoji. (These were tried and rejected as tacky.)
- **One typeface:** Archivo. No second family. No monospace.
- **One accent:** signal orange `#ff5a1f`. It appears only on: the dot in the wordmark, a hover or active marker, progress fill, and focus outlines. Never as a large fill, never as body text, never more than a few small marks per screen.
- **Square corners everywhere.** The orange dot is the only circle.
- **Separate things with space and tone steps,** not boxes. The only lines allowed are 1px dividers between list rows, drawn in the raised tone.
- **Sentence case.** No all-caps labels, no small uppercase "eyebrow" text above headings, no letter-spaced labels.
- **No AI-default tells:** no Inter, Geist, Space Grotesk or Plus Jakarta Sans; no purple gradients; no rows of identical rounded cards; no trailing arrows on links; no middle-dot separators (use `|`); no em dashes in any user-facing text.
- All times shown in the viewer's local time zone.
- Platform badges keep their brand meaning: Twitch and YouTube are named in text (the minimal version writes them as plain text, for example "Opponent | Twitch"). Never rely on color alone.

## 4. Tokens

```css
:root {              /* light (default) */
  --ground: #f2f2ef;  /* page */
  --raised: #e8e8e4;  /* dividers, progress track, framed areas */
  --ink:    #121312;  /* text */
  --soft:   #6b6d68;  /* secondary text */
  --signal: #ff5a1f;  /* the MIDA indicator light */
}
:root[data-theme="dark"] {
  --ground: #0f100f;
  --raised: #191a19;
  --ink:    #e9eae6;
  --soft:   #8d908a;
}
```

Support both themes. Default to the viewer's system setting (`prefers-color-scheme`), with a plain text toggle ("Dark" / "Light") in the header. Remember the choice per browser.

Check contrast: body text and `--soft` text must meet WCAG AA (4.5:1) on `--ground` in both themes. Orange is never used for text smaller than 18px.

## 5. Type

Archivo, self-hosted (in Next.js use `next/font/google`, no runtime request to Google). Weights 400, 500, 600 only.

| Role | Size | Weight | Tracking | Line height |
|---|---|---|---|---|
| Page title (h1) | clamp(40px, 6vw, 68px) | 500 | -0.035em | 1.02 |
| Section / sub-page title | clamp(32px, 4.4vw, 48px) | 500 | -0.03em | 1.1 |
| Item name (h2) | 26px (lists of tools), 18px (dense lists) | 600 | -0.02em / -0.01em | 1.2 |
| Body | 16 to 18px | 400 | 0 | 1.5 to 1.55 |
| Secondary | 14 to 15px | 400 | 0 | 1.5 |

Numbers that line up (times, counts, percentages) use `font-variant-numeric: tabular-nums`.

## 6. Layout

- Content max width 1080px, side padding 24px (phone) / 48px (desktop).
- Header: 88px tall (72px on sub-sites). Wordmark left, a few plain text links right.
- Big vertical rhythm: about 140px above the page title on desktop, 96px on phones; 120px between major sections.
- Lists are rows, not cards. Each row: name, one-line description, secondary detail. Desktop puts them on one baseline in columns; phones stack them.
- Everything works at 375px wide with no horizontal scroll and touch targets of at least 44px.

## 7. Components

**Wordmark.** Lowercase `mida.tools` in Archivo 600, 18px, where the `.` is `--signal`. On a sub-site the header shows `replay / mida.tools` (tool name in ink, the rest in `--soft`, the dot in orange). No logo image.

**Links and buttons.** Text only. Primary actions in `--ink` weight 600; secondary in `--soft`. Hover turns the text `--signal` (or `--ink` for secondary). Focus: 2px `--signal` outline, 3px offset. No filled buttons except where a form genuinely needs one; if needed, a flat `--ink` fill with `--ground` text, square corners.

**Hover marker.** A 7px orange dot appears to the left of the hovered item's name, and the name turns orange. Nothing else moves.

**Progress.** A 3px track in `--raised` with a `--signal` fill, followed by the percentage in tabular numerals. No segments, no glow.

**Status line.** One sentence. Bold the state ("**Caught up.**"), the rest in `--soft`.

**Media (stream thumbnails).** Square-cornered 16:9 images, no borders, no overlays except what is essential (a "No longer available" state). Platform and relation are written as text next to the name.

**Motion.** Only color transitions of about 150ms on hover. Respect `prefers-reduced-motion`. No entrance animations.

## 8. Copy

Plain, short, specific. Write what the tool does for the player.

Hub page:
- Title: "Select application."
- Lede: "Small tools for Destiny 2. Sign in once with Bungie and each one knows your account."
- Tools list, one line each:
  - **Rerolled** | Random loadouts from what your fireteam actually owns. | rerolled.mida.tools
  - **Replay** | Every stream that caught you in a match, cued to the second. | replay.mida.tools
  - **Rival** | Crucible history and your record against every player. | rival.mida.tools
- After the list, in `--soft`: "List continues."
- Footer: "mida.tools" and "Fan-made. Destiny and MIDA belong to Bungie."

## 9. Per-site notes

Restyle one site at a time; each keeps its own features and pages. Apply the same tokens, type, header and components. Do not invent new decoration per site.

- **Replay** (Next.js, Tailwind). Today it uses a "Tape Record" theme (Archivo + VT323, slate panels, label-tape names, VCR-amber timecodes, reel progress bar, amber logo tile). Replace all of that with this brief: drop VT323, the `.cut`/`.lcd`/`.dymo`/`.key`/`.scanlines` styles, the amber tile logo and the reel progress bar. The broadcast list becomes the plain rows shown in the mockup's "A tool on its own subdomain" section. Keep every behavior: sync, progress, watched, download, hide, alerts, hidden streamers, local times. Update its `CLAUDE.md` design section to point at this brief.
- **Rerolled** and **Rival**: read each repo's `CLAUDE.md` first (workflow rules differ; Rerolled's `release` branch is production and needs Liam's explicit "ship it"). Rival's data lives on AWS Lightsail, not Supabase; UI work must not touch its database.
- **mida.tools hub**: a new small static site built from the mockup's top half.

## 10. Before calling a page done

- Matches the mockup in both themes at 1440px, 768px and 375px.
- Only one typeface loaded; only `--signal` as an accent; no shadows, gradients or rounded corners.
- No em dashes, middle dots or trailing arrows in visible text.
- Keyboard focus visible everywhere; contrast AA in both themes.
- The site's own tests, typecheck and build pass.
