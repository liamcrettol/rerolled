# Rerolled Bespoke Badge Design Guide

How to design, build, preview, and iterate on hand-drawn SVG badges for the
Rerolled badge catalog (51 badges, `supabase/migrations/037_rerolled_badge_seed.sql`).
The reference implementation is **Lighthouse Writ** (Part 10) — every rule in
this document was extracted from how that badge was made.

This guide is written to be executed mechanically. If you follow every number
in here, the output will sit next to the existing badges without drifting.
When a rule and your instinct disagree, follow the rule.

---

## Part 0 — What you are making, and the one idea that matters

You are making a **flat, hand-plotted SVG chip**, 160×48 units, one per badge.
Not an illustration. Not a medal. Not generated imagery of any kind.

The single idea behind the whole system: **AI-looking badges are over-rendered
and meaningless; hand-designed badges are restrained and encoded.** A human
designer with taste spends effort on *one detail that means something* and
keeps everything else quiet. A generator spends effort everywhere and means
nothing. So:

- Every visual element must **encode something true about how the badge is
  earned**. If an element doesn't count, depict, or mark something from the
  badge's criteria, delete it.
- Prefer **one insider detail** a Destiny player would decode over five
  decorations anyone could see. (Lighthouse Writ's seven pips = the seven-win
  flawless card. Nothing on that badge is arbitrary.)

### The ban list (any one of these makes it read as AI)

- Gradients of any kind (`<linearGradient>`, `<radialGradient>`)
- Filters, blurs, glows, drop shadows (`<filter>`, `feGaussianBlur`, etc.)
- Bevels, embossing, fake 3D, metallic rendering
- Rounded corners (`rx`/`ry` on rects, rounded linecaps) — hard edges only
- More than ONE filled focal shape in the icon (everything else is stroked)
- Generic fantasy iconography: swords, shields, wings, crowns, laurel wreaths
  drawn realistically, skulls, flames, lightning bolts
- Fake runes or unreadable decorative text
- Radial symmetry for its own sake (mandalas, starbursts)
- Any hex color not in the Part 3 palette
- Textures, noise, painterly anything

---

## Part 1 — The ethos (decision principles, in priority order)

1. **Meaning before geometry.** Derive the motif from what the badge is
   *earned for*, never from what it is *named*. ("Drawn" is not a drawing of
   the word; it's the first loadout pulled from the pool.)
2. **One insider detail, maximum.** Exactly one element per badge that only a
   Destiny 2 player would decode. More than one and they cancel out.
3. **Restraint budget by tier.** Complexity is earned by rarity (Part 6).
   A bronze badge is nearly bare; only platinum/special badges may break the
   silhouette.
4. **Flat means flat, but flat is not featureless.** You get light without
   glow (stepped opacity dashes), depth without shadow (the ghost numeral),
   and ornament without decoration (a cut corner). These substitutions are
   the craft.
5. **Everything on the grid.** Stroked elements snap to half-pixels, filled
   elements to whole pixels (Part 2). Misaligned strokes are the fastest way
   to look sloppy at 1× scale.

---

## Part 2 — Canvas, zones, and the pixel grid

### Canvas

- `viewBox="0 0 160 48"` — always, no exceptions. The chip renders at exactly
  160×48 CSS px in the Badge Case, so 1 SVG unit = 1 screen px at 1×.

### The corridor map (where things are allowed to be)

```txt
y  0.......4.................15..16..............36..36.5......39.......44......48
   ├ border ├── SKY CORRIDOR ──┤  ├── BODY BAND ──┤  ground     ├ STRIP ┤ border
```

| Corridor       | y range   | What lives here                                        |
|----------------|-----------|--------------------------------------------------------|
| Sky corridor   | 4 – 15    | Beam dashes, apex ticks, top of ghost text, cut corner |
| Body band      | 16 – 36   | Icon mass (left), label text block (right)             |
| Ground line    | 36.5      | Horizon / base line the icon stands on                 |
| Base strip     | 39 – 44   | Pip rows, meters, bottom of ghost text                 |

| Zone        | x range   | What lives here                                    |
|-------------|-----------|----------------------------------------------------|
| Tier rail   | 0 – 2     | 2px filled rect in tier color                      |
| Icon zone   | 6 – 44    | The motif, centered on x=25                        |
| Label zone  | 46 – ~140 | Name text, suffix line, pips                       |
| Corner zone | top-right | Mode dot, or cut corner + mode hairline            |

Elements may cross zones **only** in the sky corridor (the beam sweeping from
the icon across the top of the label is the sanctioned example). Text never
enters the icon zone. Icons never enter the label body band.

### The pixel grid rule (this is why it looks crisp)

- **Stroked** paths with odd widths (1, 1.5) put their coordinates on
  **half-pixels**: `M8 36.5 H40`, `M21.5 36 L24 17`. A 1px stroke centered on
  a whole pixel smears across two pixels and looks blurry.
- **Filled** rects and paths go on **whole pixels**: `<rect x="46" y="40"
  width="3" height="3"/>`. Fills don't blur.
- 2px strokes go on whole pixels (they span one pixel each side).
- The chip outline is a 1px stroke, so it runs `0.5 → 159.5 / 0.5 → 47.5`.

### Silhouettes (rarity earns shape)

- **Standard**: `M0.5 0.5 H159.5 V47.5 H0.5 Z` — plain rectangle. Used by
  bronze, silver, gold.
- **Cut corner** (platinum/special only): `M0.5 0.5 H146.5 L159.5 13.5 V47.5
  H0.5 Z` — a 13px 45° cut, top-right. This is the ONLY permitted silhouette
  break. Never cut two corners, never notch the bottom.

---

## Part 3 — Color (exact values, exact usage)

### Fixed surfaces (identical on every badge)

| Element    | Value     | Notes                                                    |
|------------|-----------|----------------------------------------------------------|
| Base fill  | `#12151a` | Darker than the app panel `#171a1f` so the chip reads on both panels and page bg |
| Border     | `#2a2e36` | 1px stroke, always                                       |
| Name text  | `#ffffff` | The only permitted use of pure white                     |

### Tier colors (from `lib/badges/style.ts` — the badge's owner color)

| Tier     | Hex       |
|----------|-----------|
| bronze   | `#b45309` |
| silver   | `#c7ccd1` |
| gold     | `#facc15` |
| platinum | `#67e8f9` |
| special  | `#00aeef` |

The tier color owns the badge: the rail, the icon strokes, the focal fill,
the suffix text, the pips, the ghost text. **One badge = one tier color plus
white plus at most one mode accent.**

### Mode accents (from `lib/badges/style.ts` — a signature, not a theme)

| Mode        | Hex       |
|-------------|-----------|
| core        | `#8b93a1` |
| crucible    | `#f87171` |
| trials      | `#a78bfa` |
| iron_banner | `#fb923c` |
| pve         | `#4ade80` |
| status      | `#00aeef` |

Mode color appears in EXACTLY ONE place per badge, and its total area must be
tiny relative to the tier color:

- Standard silhouette: a 4×4 filled rect at `x=150 y=4` (the mode dot).
- Cut-corner silhouette: a 1px hairline parallel to the cut,
  `M144.5 2 L157.5 15`, opacity 0.9, and NO dot.

### The opacity ladder (the only "gradient" you get)

Any falloff — beam dashes, echo lines, trailing elements — uses these exact
stops in order: **1.0, 0.7, 0.42, 0.28, 0.17, 0.09**.

Fixed special values: scaffold/horizon lines `0.3`; ghost text `0.08`;
secondary pips `0.7` (final pip `1.0`).

Never invent an opacity. Never use CSS `filter` to dim anything.

---

## Part 4 — Typography (exact parameters)

Font family everywhere:
`-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` — the system
stack the whole app ships. Never add a webfont, never use serif or mono.
All text is UPPERCASE. Real words only — no decorative glyph strings.

### Lockup A — two-line (name + suffix)

Use when the name splits into a distinctive word + a family suffix
(LIGHTHOUSE **WRIT**, UNBROKEN **CHAIN**, PASSAGE **VII**), or when the full
name exceeds 12 characters.

```svg
<text x="46" y="25.5" font-size="10.5" font-weight="800"
      fill="#ffffff" letter-spacing="1.1">LIGHTHOUSE</text>
<text x="46" y="34" font-size="6.5" font-weight="700"
      fill="{TIER_HEX}" letter-spacing="2.6">WRIT</text>
```

The suffix line is set in **tier color** with wide tracking. Suffix families
in the current catalog (always use lockup A for these): WRIT ×7 (crucible,
banner, vanguard, lighthouse, encounter, deep, raid), CHAIN ×2, PASSAGE ×3
(suffix = the numeral: blank/III/VII), ORDEAL ×2 (blank/GRAND — invert:
"GRAND" on top at 10.5px, "ORDEAL" as the suffix line), ACCORD ×2.

### Lockup B — single line

Use for short single-word names (DRAWN, BOUND, APEX, REDLINE, FORGED...).

```svg
<text x="46" y="28.5" font-size="10.5" font-weight="800"
      fill="#ffffff" letter-spacing="1.1">REDLINE</text>
```

If the badge has no pip row, move to `y=29` (optically centered). If it has
one, keep `y=28.5`.

### Fitting text without measuring (you cannot measure — use this table)

At 10.5px / weight 800 / 1.1 tracking, each character occupies ~8.2px.
Label zone width is ~94px (x 46 → 140), or ~88px with a cut corner.

| Characters in the line | Action                                          |
|------------------------|--------------------------------------------------|
| ≤ 11                   | 10.5px, no change                                |
| 12                     | 10.5px, reduce letter-spacing to 0.7             |
| 13 – 14                | Drop to 9.5px, letter-spacing 0.8                |
| ≥ 15                   | Must use lockup A (split the name)               |

Never go below 9px. Never squash with `textLength`.

### Ghost text (flourish c, Part 6)

```svg
<text x="152" y="44" text-anchor="end" font-size="21" font-weight="800"
      fill="{TIER_HEX}" opacity="0.08" letter-spacing="1">VII</text>
```

Max 3 characters. Must be a number/numeral that appears in the badge's
criteria (VII = seven wins, X = ten streak, 50 = fifty defeats). If the
criteria has no meaningful number, this flourish is unavailable — do not
invent one.

---

## Part 5 — Iconography (how to design a motif from scratch)

This is the only genuinely creative step. Do it as a written exercise BEFORE
drawing anything:

1. **Write the earning sentence.** "This badge is earned by ___" — copy the
   criteria from the seed migration, not the badge name.
2. **List three concrete nouns** from that sentence's world. Concrete = a
   thing with a silhouette. ("Flawless" is not a noun. "The Lighthouse" is.)
3. **Pick the noun drawable in 8 strokes or fewer.** If none qualifies,
   abstract one level: a threshold becomes a line crossed; a streak becomes
   repeated links; a team becomes aligned marks.
4. **Draw it as line art**, then apply the composition rules below.

### Composition rules

- Stroke color = tier color. `stroke-width="1.5"` for primary structure,
  `1` for secondary detail, `2` for the base/slab. `stroke-linecap="square"`,
  `stroke-linejoin="miter"` — never round.
- **The one-fill rule**: exactly one small filled shape as the focal point
  (Lighthouse Writ's beacon diamond). Everything else is stroked. The fill
  is what the eye lands on; two fills = no focal point.
- Ground the motif: a base/horizon element at `y=36.5` (horizon line
  `M8 36.5 H40` at opacity 0.3, and/or a 2px base slab). Floating icons look
  like clip-art.
- Vertical mass centered on `x=25`, total height within `y=4 → y=36`.
- 5 – 9 path elements total. Under 5 reads as lazy; over 9 reads as noise.

### Worked derivations (real badges from the catalog — use these)

| Badge | Earned by | Concrete nouns | Chosen motif (stroke plan) |
|---|---|---|---|
| `core_drawn` | First activity with an active loadout | pool, slots, first pull | Three slot rectangles in a row at the ground line; the first one raised 4px above the others (the pull). No fill, or fill the raised one. |
| `core_bound` | Zero non-rolled final blows | binding, loadout, lock | Two vertical strokes (the player and the roll) wrapped by a horizontal 3-line binding band at mid-height. Fill: none; the band's center line at width 2 is the focal weight. |
| `core_threefold` | A final blow with each rolled weapon | three weapons, three slots | Three small diamonds ascending left-to-right on a baseline; third diamond filled (the one-fill). |
| `core_chain` / `core_unbroken_chain` | 5 / 10 valid matches in a row | links, chain | Three interlocked rectangle outlines on the ground line, center link filled. Differentiate with the pip row (5 vs 10 pips) and ghost "V" vs "X", NOT by redrawing the chain. |
| `crucible_redline` | 50+ defeats in one match | threshold, gauge, line | Horizontal meter track at y=26 with a tick at 3/4; a filled marker square just PAST the tick. Ghost "50". |
| `crucible_untouched` | Finish undefeated | unbroken ring, zero | A single circle (r=9, centered 25,22) with a 1px apex tick — deliberately using the shared "ring" motif language but closed and clean. Fill: 2px dot at exact center. |
| `crucible_apex` | Top of team score | summit, peak | Two ascending line segments meeting at a peak (x=25, y=10); a small filled square at the apex; horizon at 36.5. |
| `trials_cardbound` | Complete a full card, rule active | the passage card | A card: 12×16 rect outline at center; inside it, a 3-wide pip grid suggestion (3 tiny filled squares). Ghost none (pips carry the number). |
| `pve_grand_ordeal` | Complete a GM Nightfall | summit, ordeal, ascent | Steep single peak line with a switchback (two direction changes), tiny filled flag square at the top. NOT a skull (ban list). |
| `status_founder` | Played during closed beta | cornerstone, foundation | Three-course block wall (staggered rect outlines) on the ground line, corner block filled. Ghost none. |

Follow the same table format when deriving any new motif, and write the table
row down BEFORE writing SVG.

---

## Part 6 — The flourish menu and the rarity ladder

A flourish is one extra system beyond base + rail + icon + label. Each must
encode a fact from the criteria. The full menu:

| # | Flourish | Encodes | Exact spec |
|---|---|---|---|
| a | **Pip row** | A count that matters (wins, streak, matches) | 3×3 filled squares at `y=40`, first at `x=46`, pitch 7px, opacity 0.7; FINAL pip 4×4 at `y=39.5`, opacity 1.0. Max 10 pips (pitch 6 if 10). |
| b | **Stepped beam / trail** | Light, motion, a sweep | 1.4px-tall filled rects at `y=10.7` in the sky corridor, lengths descending 9,7,6,5,4,3 with gaps growing 4→6px, opacities from the ladder (0.85, 0.6, 0.42, 0.28, 0.17, 0.09). |
| c | **Ghost numeral** | A number in the criteria | Part 4 spec. Only if the number is real. |
| d | **Silhouette cut + mode hairline** | Apex rarity itself | Part 2 cut-corner spec. PLATINUM AND SPECIAL ONLY. |
| e | **Baseline meter** | A threshold crossed | 1px track `M46 41.5 H110` opacity 0.3; threshold tick `M94 39.5 V43.5`; filled 3×3 marker past it at x=98. Mutually exclusive with (a) — same strip. |

### The rarity ladder (how many flourishes a badge may have)

| Tier | Flourishes | Silhouette | Result |
|---|---|---|---|
| bronze | 0 | standard | Base + rail + icon + label + mode dot. Quiet. |
| silver | 1 | standard | One flourish from a/b/c/e. |
| gold | up to 2 | standard | Two flourishes, if both encode different facts. |
| platinum | up to 3 + d | cut corner | The full treatment. |
| special | up to 3 + d | cut corner | As platinum; status badges may also use (c) with a letter glyph instead of numeral. |

This ladder is why the system stays coherent across 51 badges: **rarity is
legible as visual complexity.** A bronze badge next to a platinum badge should
be obviously outclassed. Do not "make the bronze ones cooler" — their
plainness is what makes platinum mean something.

---

## Part 7 — The code template

Layer order is fixed. Fill in the `{SLOTS}`; delete sections the rarity
ladder doesn't grant.

```svg
<svg viewBox="0 0 160 48" xmlns="http://www.w3.org/2000/svg" role="img"
     aria-label="{NAME} badge. {CRITERIA_SENTENCE}">
  <!-- 1. base silhouette (pick ONE) -->
  <path d="M0.5 0.5 H159.5 V47.5 H0.5 Z"                      <!-- standard -->
        fill="#12151a" stroke="#2a2e36" stroke-width="1"/>
  <!-- OR platinum/special: -->
  <!-- <path d="M0.5 0.5 H146.5 L159.5 13.5 V47.5 H0.5 Z" ... /> -->

  <!-- 2. tier rail -->
  <rect x="0" y="0" width="2" height="48" fill="{TIER_HEX}"/>

  <!-- 3. mode accent (pick ONE) -->
  <rect x="150" y="4" width="4" height="4" fill="{MODE_HEX}"/> <!-- standard -->
  <!-- OR with cut corner: -->
  <!-- <path d="M144.5 2 L157.5 15" stroke="{MODE_HEX}" stroke-width="1" opacity="0.9"/> -->

  <!-- 4. ghost numeral (flourish c, if granted) -->
  <text x="152" y="44" text-anchor="end" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        font-size="21" font-weight="800" fill="{TIER_HEX}" opacity="0.08"
        letter-spacing="1">{NUMERAL}</text>

  <!-- 5. icon (5-9 elements, one fill, grounded at 36.5) -->
  <g stroke="{TIER_HEX}" fill="none" stroke-width="1.5" stroke-linecap="square">
    <path d="M8 36.5 H40" stroke-width="1" opacity="0.3"/>     <!-- horizon -->
    {ICON_STROKES}
  </g>
  {ICON_FOCAL_FILL}   <!-- one filled path, fill="{TIER_HEX}" -->

  <!-- 6. beam (flourish b, if granted) -->
  <g fill="{TIER_HEX}">
    <rect x="32" y="10.7" width="9" height="1.4" opacity="0.85"/>
    <rect x="45" y="10.7" width="7" height="1.4" opacity="0.6"/>
    <rect x="56" y="10.7" width="6" height="1.4" opacity="0.42"/>
    <rect x="66" y="10.7" width="5" height="1.4" opacity="0.28"/>
    <rect x="75" y="10.7" width="4" height="1.4" opacity="0.17"/>
    <rect x="83" y="10.7" width="3" height="1.4" opacity="0.09"/>
  </g>

  <!-- 7. label (lockup A or B, Part 4) -->
  <text x="46" y="25.5" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        font-size="10.5" font-weight="800" fill="#ffffff"
        letter-spacing="1.1">{NAME_MAIN}</text>
  <text x="46" y="34" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        font-size="6.5" font-weight="700" fill="{TIER_HEX}"
        letter-spacing="2.6">{NAME_SUFFIX}</text>

  <!-- 8. pip row (flourish a, if granted) — {N} pips, pitch 7 -->
  <g fill="{TIER_HEX}">
    <rect x="46" y="40" width="3" height="3" opacity="0.7"/>
    <!-- ...repeat at x = 46 + 7k... -->
    <rect x="{FINAL_X}" y="39.5" width="4" height="4"/>        <!-- final pip -->
  </g>
</svg>
```

Hard checks before you call a badge done:

- [ ] No `filter`, no `*Gradient`, no `rx`, no `stroke-linecap="round"`
- [ ] Every stroked path with width 1 or 1.5 has `.5` coordinates
- [ ] Every filled rect has whole-number coordinates
- [ ] Exactly one filled shape inside the icon group
- [ ] Only colors: `#12151a`, `#2a2e36`, `#ffffff`, one tier hex, one mode hex
- [ ] Flourish count ≤ the tier's allowance (Part 6 ladder)
- [ ] `aria-label` present with name + criteria sentence
- [ ] Nothing outside its corridor (Part 2 map)

---

## Part 8 — Building the preview page

Every badge (or batch of badges) gets a dark preview page before anyone
approves it. Structure, in order:

1. **Hero** — the badge at ~3.5× (`width="560"`), centered in a bordered
   `#0a0d12` panel, so craft details are inspectable.
2. **Actual size row** — the badge at exactly 160×48 **next to two standard
   system chips** (copy them from the existing preview pages). This is the
   pass/fail view: the bespoke badge must sit in the same family without
   shouting. If it looks like it came from a different site, it failed.
3. **Notes** — one line per design decision, each naming the criteria fact it
   encodes. If you can't write the line, the element shouldn't exist.
4. **SVG source** — the full code in a `<pre>` block.

Define the badge once as a `<symbol id="{slug}" viewBox="0 0 160 48">` in a
hidden `<svg width="0" height="0">`, then instantiate with
`<svg width="160" height="48"><use href="#{slug}"/></svg>` at each size —
one source of truth per page, no divergence between hero and actual size.

Page styling: background `#070a0f`, text `#e7eaee`, dim `#8b93a1`, borders
`#2a2e36`, section labels 11px/700/uppercase/0.14em tracking. System font
stack. No rounded corners on the page either — the preview should feel like
the app.

For batches: one page per mode group (Core, Crucible, ...), hero grid of all
badges in the group at 2×, then the actual-size family row.

---

## Part 9 — Iteration protocol (translating feedback into parameter changes)

Rules of engagement: always regenerate the complete SVG (never describe a
change without re-emitting code), always re-render the preview, and change
the SMALLEST number of parameters that satisfies the note.

| Feedback | What to change (in order, stop when satisfied) |
|---|---|
| "too busy" | Delete the lowest-value flourish (ghost first, then beam). Reduce icon secondary strokes. Never shrink text to make room. |
| "too plain" | Add ONE flourish from the menu that encodes an unencoded fact. Do NOT add strokes to the icon. |
| "icon is unreadable" | Enlarge focal fill by 1px each side → drop secondary (width-1) strokes → raise main strokes to 2 → simplify to fewer, longer strokes. |
| "looks AI" | Audit the Part 0 ban list literally, element by element. The cause is almost always: an off-palette color, a symmetric starburst-ish icon, more than one fill, or a rounded cap. |
| "make it pop" | Increase tier-color AREA, not intensity: rail 2→3px, focal fill +1px, final pip 4→5px. Never add glow, never saturate, never brighten off-ladder. |
| "doesn't feel like [game thing]" | Wrong noun. Return to Part 5 step 2, pick a different noun, redraw. Don't decorate the wrong motif. |
| "text feels cramped / too small" | Move DOWN the Part 4 fitting table one row (shorter effective line), or switch lockup B→A. Never exceed 10.5px. |
| "the [element] should be [color]" | Only comply if the color is in the palette AND respects the one-mode-accent rule; otherwise map to nearest legal equivalent and say so. |
| "make them all more like [badge X]" | Extract which FLOURISH or lockup X uses; apply that choice across the set. Do not copy X's icon. |

When feedback conflicts with the tier ladder (e.g. "give this bronze badge a
cut corner"), flag the conflict and ask, because the ladder is what keeps
rarity legible — but the human's explicit decision wins.

---

## Part 10 — The reference implementation, annotated

Lighthouse Writ (`trials_lighthouse_writ`, platinum, trials): earned by going
Flawless — seven Trials wins, zero losses — with valid Rerolled loadouts.

Derivation table (Part 5): nouns = *the Lighthouse* (flawless reward
destination on Mercury), *the passage card*, *seven wins*. Chosen: the
Lighthouse (drawable in 7 strokes + 1 fill). Card and seven both survive as
flourishes instead.

```svg
<svg viewBox="0 0 160 48" xmlns="http://www.w3.org/2000/svg">
  <!-- cut-corner silhouette: platinum earns the broken outline (ladder, Part 6) -->
  <path d="M0.5 0.5 H146.5 L159.5 13.5 V47.5 H0.5 Z"
        fill="#12151a" stroke="#2a2e36" stroke-width="1"/>
  <!-- platinum rail: the tier owns the badge -->
  <rect x="0" y="0" width="2" height="48" fill="#67e8f9"/>
  <!-- trials hairline parallel to the cut: the mode signature, replaces the dot -->
  <path d="M144.5 2 L157.5 15" stroke="#a78bfa" stroke-width="1" opacity="0.9"/>
  <!-- ghost VII: the seven-win passage (flourish c; the number is real) -->
  <text x="152" y="44" text-anchor="end" font-size="21" font-weight="800"
        fill="#67e8f9" opacity="0.08" letter-spacing="1">VII</text>
  <!-- icon: 7 strokes, grounded, mass on x=25 -->
  <g stroke="#67e8f9" fill="none" stroke-width="1.5" stroke-linecap="square">
    <path d="M8 36.5 H40" stroke-width="1" opacity="0.3"/>   <!-- horizon, 0.3 -->
    <path d="M19.5 36.5 H30.5" stroke-width="2"/>            <!-- base slab, 2px -->
    <path d="M21.5 36 L24 17"/><path d="M28.5 36 L26 17"/>   <!-- tapering spire -->
    <path d="M22.6 22 H27.4" stroke-width="1"/>              <!-- gallery, secondary 1px -->
    <path d="M25 6 V4" stroke-width="1"/>                    <!-- apex tick -->
  </g>
  <!-- THE one fill: the beacon. Focal point of the whole badge -->
  <path d="M25 8 L28.2 11.2 L25 14.4 L21.8 11.2 Z" fill="#67e8f9"/>
  <!-- beam (flourish b): light with zero gradients, opacity ladder verbatim -->
  <g fill="#67e8f9">
    <rect x="32" y="10.7" width="9" height="1.4" opacity="0.85"/>
    <rect x="45" y="10.7" width="7" height="1.4" opacity="0.6"/>
    <rect x="56" y="10.7" width="6" height="1.4" opacity="0.42"/>
    <rect x="66" y="10.7" width="5" height="1.4" opacity="0.28"/>
    <rect x="75" y="10.7" width="4" height="1.4" opacity="0.17"/>
    <rect x="83" y="10.7" width="3" height="1.4" opacity="0.09"/>
  </g>
  <!-- lockup A: WRIT family suffix in tier color -->
  <text x="46" y="25.5" font-size="10.5" font-weight="800" fill="#ffffff"
        letter-spacing="1.1">LIGHTHOUSE</text>
  <text x="46" y="34" font-size="6.5" font-weight="700" fill="#67e8f9"
        letter-spacing="2.6">WRIT</text>
  <!-- pip row (flourish a): the flawless card. Six at 0.7, the seventh —
       the win that sends you to Mercury — full and one step larger.
       This is the badge's ONE insider detail. -->
  <g fill="#67e8f9">
    <rect x="46" y="40" width="3" height="3" opacity="0.7"/>
    <rect x="53" y="40" width="3" height="3" opacity="0.7"/>
    <rect x="60" y="40" width="3" height="3" opacity="0.7"/>
    <rect x="67" y="40" width="3" height="3" opacity="0.7"/>
    <rect x="74" y="40" width="3" height="3" opacity="0.7"/>
    <rect x="81" y="40" width="3" height="3" opacity="0.7"/>
    <rect x="87.5" y="39.5" width="4" height="4"/>
  </g>
</svg>
```

Note it uses flourishes a + b + c + d — the maximum, because it is the apex
badge of the whole catalog. Almost nothing else should reach this density.

---

## Appendix — One-screen constants card

```txt
CANVAS      viewBox 0 0 160 48
SILHOUETTE  std: M0.5 0.5 H159.5 V47.5 H0.5 Z
            cut (plat/special): M0.5 0.5 H146.5 L159.5 13.5 V47.5 H0.5 Z
BASE        fill #12151a  ·  border #2a2e36 @1px  ·  rail 2px tier @ x0
TIERS       bronze #b45309 · silver #c7ccd1 · gold #facc15 · plat #67e8f9 · special #00aeef
MODES       core #8b93a1 · cruc #f87171 · trials #a78bfa · ib #fb923c · pve #4ade80 · status #00aeef
MODE MARK   std: rect 4×4 @ (150,4)  ·  cut: hairline M144.5 2 L157.5 15 @0.9
OPACITY     1.0 / .7 / .42 / .28 / .17 / .09  ·  scaffold .3  ·  ghost .08
TEXT        name 10.5px/800/ls1.1 #fff @ x46 (y25.5 two-line, y28.5 single)
            suffix 6.5px/700/ls2.6 tier @ (46,34)
            ghost 21px/800/.08 tier, anchor end @ (152,44), max 3 chars
ICON        zone x6-44, center x25, ground y36.5, 5-9 elements,
            stroke tier 1.5 (detail 1, slab 2), cap square, ONE fill
PIPS        3×3 @ y40, start x46, pitch 7, op .7; final 4×4 @ y39.5 op 1
BEAM        rects 1.4 tall @ y10.7, lengths 9/7/6/5/4/3, ladder opacities
LADDER      bronze 0 flourish · silver 1 · gold 2 · plat/special 3 + cut
STROKES     odd widths on .5 coords · fills on integers · no rounding, ever
```
