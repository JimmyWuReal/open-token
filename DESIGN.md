# Open Token — Design System

This document defines the visual language for Open Token. **Follow it for any UI
change.** The three governing principles:

1. **Monochrome only.** Black, white, and grays. No hues — ever.
2. **Brightness encodes importance.** The product is a **dark theme**: the canvas
   is near-black, so *lighter* elements read as more important and darker grays
   recede.
3. **Smooth edges.** Everything is rounded. No sharp 0px corners on surfaces,
   controls, or fills.

---

## 1. Color — black & white only (dark theme)

There are **no chromatic colors** anywhere in the product. Importance and
hierarchy are expressed purely through brightness. The canvas is **near-black**,
so the *lighter* a thing is, the more it stands out.

The `:root` is set to `color-scheme: dark` so native controls (select dropdowns,
checkboxes) render against the dark canvas.

The token names are brightness-agnostic and carry **weight** semantics, not a
literal lightness: `--ink-900` is the heaviest (here, the lightest gray) and
`--ink-400` the faintest. This means the theme can be flipped by editing only the
`:root` values — the rest of the CSS references tokens by weight, not by color.

All values live as CSS custom properties in `src/styles.css` (`:root`). Use the
tokens — never hardcode a hex value.

| Token             | Value     | Brightness role               | Use for                                          |
| ----------------- | --------- | ----------------------------- | ------------------------------------------------ |
| `--bg`            | `#0c0c0d` | canvas (near-black)           | page background, input fields                    |
| `--surface`       | `#151517` | raised, just above canvas     | cards, panels, metric tiles, tables              |
| `--surface-strong`| `#202023` | recessed track                | progress/bar tracks                              |
| `--line`          | `#28282b` | hairline                      | default borders, dividers                        |
| `--line-strong`   | `#3a3a3e` | visible border                | control borders (select, toggle)                 |
| `--ink-400`       | `#6d6d73` | muted (darkest text)          | captions, axes, eyebrows, smallest detail text   |
| `--ink-500`       | `#9a9aa1` | secondary                     | labels, secondary copy                           |
| `--ink-700`       | `#c9c9ce` | strong body                   | default body text                                |
| `--ink-900`       | `#f6f6f7` | **maximum weight (lightest)** | headlines, key numbers, primary buttons          |
| `--fill`          | `#ededf0` | solid emphasis                | chart lines, bar fills, progress fills           |

### Hierarchy rules

- The single most important thing in a region is the **lightest** (`--ink-900`):
  the `<h1>`, a metric's value, the primary action.
- Supporting labels step darker (`--ink-500`), and incidental captions darker
  still (`--ink-400`) — fading toward the canvas.
- Never use a border lighter than the text it surrounds for decoration.
- The primary button is **inverted**: `--ink-900` (light) background with `--bg`
  (dark) text. This is the one place where light = the call to action. Secondary
  controls stay on the dark canvas with a `--line-strong` border.

### Encoding state without color

Because we can't reach for red/green/amber, state is shown through **brightness,
weight, and pattern**:

- **Error / issue:** darken the relevant text to `--ink-900`, bump weight, and
  use a striped fill (`repeating-linear-gradient` between `--ink-900` and
  `--ink-400`) where a solid fill would otherwise sit. See
  `.collection-status.error .progress-wrap i`.
- **Success / running / neutral:** plain solid `--fill`.
- Do **not** introduce a color to signal status. Pattern + brightness only.

---

## 2. Smooth edges

Rounded corners everywhere. Use the radius tokens; don't invent ad-hoc values.

| Token           | Value   | Use for                                             |
| --------------- | ------- | --------------------------------------------------- |
| `--radius-sm`   | `8px`   | inputs, selects, inline `code`                      |
| `--radius-md`   | `14px`  | metric tiles, status card, tables                   |
| `--radius-lg`   | `20px`  | large content panels                                |
| `--radius-pill` | `999px` | buttons, toggles, progress tracks, bar tracks       |

Additional smoothing:

- Pills (`--radius-pill`) are the default for **interactive controls** (buttons,
  toggles) and for **any horizontal track or fill** (progress bars, ranking
  bars).
- SVG strokes use `stroke-linecap: round` and `stroke-linejoin: round` so chart
  lines never end or bend in a hard point.
- Containers that clip children (tables, progress wraps) carry `overflow: hidden`
  so the child fills inherit the rounded corner.

---

## 3. Layout & surfaces

- **Canvas-first.** The page is near-black. Content groups sit on `--surface` cards
  with a `--line` hairline border and a radius token. Earlier versions used
  borderless 1px-gap grids; the current system prefers discrete rounded cards
  separated by real gaps (`gap: 12–16px`).
- **Spacing** is generous; lean on the existing `clamp()` paddings in `.shell`
  and the per-component padding already defined.
- **Typography:** Inter / system sans. Headline is a large `clamp(36px, 6vw,
  72px)` with tight `-0.01em` tracking. Numbers use `font-variant-numeric:
  tabular-nums` wherever they align in columns.
- **Motion:** transitions are short and easing-based (`160–260ms ease`). Used for
  hover (button `opacity`) and value changes (bar/progress `width`). Keep motion
  subtle.

---

## Checklist before shipping a UI change

- [ ] No hex colors with hue — only the grayscale tokens (or `currentColor`).
- [ ] Importance reflected by brightness (on this dark theme, most important = lightest).
- [ ] Every corner uses a radius token; nothing is square.
- [ ] State (error/success) shown via brightness/weight/pattern, not color.
- [ ] New colors/radii added as `:root` tokens, not inline literals.
