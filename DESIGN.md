# Design

Captured from the implemented system in `src/styles/globals.css` and the authoritative
source, `Ledgr Brand Guidelines C.dc.html`. The guidelines file is self-contained; open it
in a browser. It also holds the working Bayer-dither implementation that
`src/components/brand/DitherField.tsx` is ported from.

## Visual Theme

A ledger rendered as a grid. Near-black ground with green in it, one saturated accent, and
pixel-native texture: backgrounds are ordered-dither fields, motion steps in cells, the
logo doubles as a progress indicator. Dense but quiet. The reference point for interaction
patterns is Revolut and similar fintech; the reference point for restraint is the
guidelines' own 78 / 18 / 4 proportion.

Both themes ship. Dark is the brand as specified. Light is a documented derivation, not a
mechanical inversion.

## Color

Strategy: **Restrained**. Emerald is the only saturated thing on screen and never
decorates. Proportion is roughly 78 Carbon / 18 Paper / 4 Emerald.

### Brand constants

These five never change between themes; only the role each one plays does.

| Token | Hex | Role |
|---|---|---|
| `--carbon` | `#080A09` | Page ground (near-black with green in it) |
| `--carbon-2` | `#151816` | Cards, raised surfaces |
| `--paper` | `#EEF1EE` | Text, inverted surfaces |
| `--emerald` | `#00B36B` | The posted cell; accents, links, fills |
| `--emerald-deep` | `#0A5C3A` | Dither fields, and light-mode accent ink |

### Semantic roles

Consumed through shadcn's semantic names. Dark values in parentheses.

- Ground / ink: `--background` Paper (Carbon), `--foreground` Carbon (Paper)
- Surfaces: `--surface`, `--surface-raised`, `--card`, `--popover`
- Text ramp: `--muted-foreground` 58% (62%), `--subtle-foreground` 42% (46%)
- Hairlines: `--border` 12% (12%), `--border-strong` 20% (16%)
- Direction: `--positive`, `--negative` (`#C8372D` light / `#FF6B5E` dark), `--transfer`
  (`#0A63B4` light / `#4DA3FF` dark). Transfers are the third direction and get their own ink
  rather than borrowing emerald, which read as "accent" where the row means "neither in nor
  out". Not `--chart-4`: that blue is a mark colour and scores 3.76:1 on Paper, failing as
  text the same way bright Emerald does. The three inks land within a stop of each other on
  their grounds (4.57 / 5.34 / 7.08 light, 7.11 / 7.56 / 7.24 dark) so no one direction
  shouts. Reserved for the transfer arrow and the transfer mode mark; a transfer icon on a
  primary fill keeps Paper, like any other.
- `--primary-foreground` is Paper in both themes: emerald fills carry white ink. Carbon on
  Emerald scores better (7.1:1 vs 2.8:1), so this is a deliberate exception to the contrast
  floor, taken for the fintech read on a single-user app. **Settled, not outstanding**: the
  alternative was filling primary buttons with Emerald Deep, which keeps the white ink at
  8.1:1, and was declined in favour of the brand colour at full strength. Do not "fix" it in
  an accessibility pass.
- `--muted` is the only tint defined *against* a card (Carbon 4% / Paper 6%), so it is the
  correct token for row hover. `--surface` equals `--card` in both themes: a tint built on
  it is invisible.

### The light-mode rule that is not an inversion

`#00B36B` on Paper is ~2.3:1 and fails as text. Light mode therefore reads in Emerald Deep
via `--accent-ink`, and reserves bright Emerald for fills and chart marks.

### Chart palette

`--chart-1..7` are **not** brand tints. Nine shades of emerald are unreadable as a category
encoding, so the palette is emerald-anchored (slot 1 is Emerald) then spread across hues
`[156, 320, 65, 250, 20, 285, 110]`, generated in OKLCH at L 0.58 (light) / 0.64 (dark) and
validated with the `dataviz` skill's `validate_palette.js` against both surfaces: lightness
band, chroma floor, CVD adjacency, normal-vision floor, contrast. **Re-run the validator on
any change.** Assign in fixed order, never cycled; an eighth category folds into
`--chart-other`. Hues 180–225 are unusable, sRGB cannot reach the chroma floor there.

Tokens reach ECharts already resolved to `rgb()` (see `useResolvedTokens`), because zrender
parses colours to interpolate them and a `color-mix()` string parses to undefined.

## Typography

Two families, both self-hosted so the service worker can cache them.

- **Instrument Sans** (500 / 600 / 700) for voice.
- **DM Mono** (400 / 500) for figures, timestamps and labels: anything that belongs in a
  cell. Every monetary amount is DM Mono, always.

| Style | Spec | Class |
|---|---|---|
| Display | 700, tracking −0.04em | `.display-tight` |
| Heading | 600, ~24px, −0.015em | `.heading-tight` |
| Body | 500, ~16px / 1.55 | body default |
| Figures | DM Mono 500, tracking .02em | `.tabular` |
| Micro-label | DM Mono 500, 10px, .12em, uppercase, `--subtle-foreground` | `.label-mono` |

Fixed rem-ish scale, not fluid: this is product UI at consistent DPI.

Money renders through `<Money>`, which dims decimals and the currency symbol to 45% so
magnitude reads first. With `animate`, it rolls through NumberFlow; the dimming and the
hero's size steps reach the shadow DOM via `::part()`, and
`--number-flow-mask-height: 0.12em` narrows the reel window to the glyph so the neighbouring
digit never shows mid-roll.

## Layout

- Radii run 14 / 16 / 20 / 24 / 32px off `--radius: 0.875rem`.
- App shell: 236px sidebar rail (nav, Add, ⌘K trigger, theme toggle at the foot) plus a
  scrolling main column capped at 1400px with 24px gutters. No top bar.
- Dashboard stack: net worth hero → Income / Expenses / Balance (3-up) → the two category
  donuts (2-up) → Balances / Budgets (2-up). The two bottom cards are held to one height
  structurally, by a `mt-auto` `<PanelAction>` rather than a fixed height, so the shorter list
  spends its slack above an anchored affordance and the dither field covers it.
- Responsive behaviour is structural (column counts), never fluid type.

## Components

shadcn/ui (new-york) for functional components: forms, dialogs, dropdowns, core tables.
Aceternity-style flourish is reserved for hero moments, empty states and backgrounds.
pqoqubbw/icons for animated Lucide icons. Charts are ECharts via `echarts-for-react`,
SVG renderer, registering only the pieces used.

Brand primitives:

- `<GridMark>` — the 3×3 mark. Bottom-right cell is always Emerald. Never scaled
  non-uniformly, never a tenth cell. Doubles as the loading indicator with cells filling.
- `<DitherField>` — Bayer 4×4 ordered dither on canvas, `image-rendering: pixelated`. In
  light mode the ink inverts to Carbon so the texture reads as shadow on Paper rather than
  glow on Carbon.
- `<EmptyState>` — icon or outline mark, headline, one line of copy, CTA, over a masked
  dither field. Every chart, table and panel has one; a bare "no data" is not acceptable.
- `<Panel>` — title, optional right-hand figure, body. The single card vocabulary.
- `<ShareGrid>` — part-to-whole across accounts as 100 brand cells (25 x 4), so one cell is
  one percent and a row's figure is its own cell count rather than a second rounding that can
  disagree by a point. Allocation is largest-remainder (`src/lib/allocate.ts`): any non-zero
  balance owes at least one cell, anything at or below zero gets none. Hue is the categorical
  palette keyed to the account's place in the list, held to `--share-rest` chroma so seven
  hues do not overrun 78/18/4; inspecting one lifts it to `--share-lit` and pushes the rest to
  14% opacity. Both strengths are per-theme, because mixing 52% of a hue into white gives a
  pastel. Hover is two-way: a row lights its cells, a cell lights its row.
- `<CellMeter>` — a fraction of a known boundary as a run of cells: spend against a budget,
  and elapsed time against the next posting on Recurring. Not for accounts: measuring each
  against the largest one ranks them and says nothing about how the whole divides, which is
  the question the Balances card is asked.
- `<AmountPad>` — cents-first amount entry (`cents * 10 + digit`), a 12-key 3x4 grid with no
  dead cell and no decimal key. Bare digits and Backspace also drive it, but only while no
  input holds focus, which is why entry dialogs focus the panel rather than a field.
- `<DataTable>` — the one table, over TanStack Table v9 (`useTable`, `tableFeatures`). Sorting
  is the only feature registered: filtering happens above it against the API, because the
  server already takes month, kind, account, category and search, and filtering the page of
  rows the client happens to hold would disagree with the totals underneath. `table-fixed`
  with proportional column widths, since auto layout lets the flexible column swallow the
  slack and open a canyon between a short name and its category.
- `<FilterBar>` / `useFilters` — search, account and category in one row above the table.
  Filter state lives in the URL beside `month`, so a filtered view is a link and the back
  button steps through it. Radix cannot hold an empty value, so "no filter" is named `ANY`.
- `<RowAction>` — an affordance that rests visible and hides itself only where a pointer can
  bring it back (`.row-action`). Written the other way round it is unreachable on exactly the
  device that cannot hover; focus reveals it, so the keyboard path never depends on a pointer.
- `<ConfirmDialog>` — one confirmation whose description is always written by its caller. A
  soft delete and a hard delete look identical at the moment of clicking, so the copy is the
  only thing that distinguishes archiving an account from deleting a transaction.
- `<DynamicIcon>` — an icon chosen by name at a component's top level, via `createElement`. A
  capitalised local assigned from `resolveIcon` reads as defining a component inside render.
- `<PageHeader>` — the screen's name on the left, what you can do about it on the right, and
  no subtitle slot. Every line written under a page title restated either the title or the
  control beside it; a rule that only holds if the slot does not exist.
- `<DatePicker>` — Popover + shadcn `Calendar` (react-day-picker), `dd/MM/yyyy` in mono,
  Monday-first, today marked in ink rather than a filled cell. ISO `YYYY-MM-DD` stays on the
  wire; a native `type="date"` is never used, since it renders the browser's locale order and
  its own unstyleable chrome. Brand overrides are passed from here, not edited into the
  shadcn file, so the component stays replaceable.

### Screen shapes

A card holding a column of identical rows is the default that every list falls into, and three
screens of it read as one screen repeated. Each management screen takes the shape its content
actually has:

- **Accounts** — a card grid (`auto-fit minmax(248px, 1fr)`, so the last row fills at any
  count). Name, icon and balance, and nothing else: row form was wrong once net worth and the
  share column came out, because four rows carrying one figure each is a list pretending to be
  a table, and a card carries one figure without looking underfed.
- **Categories** — wrapping tiles on the page ground, no card. A category is two or three
  words, so a full-width row spends nine tenths of its line on nothing, and two card columns
  leave the shorter list standing in its own empty half. The tile is the edit affordance and
  archive sits beside it, never inside: a button within a button is invalid markup.
- **Recurring** — stays a list, because the question is *what posts next* and that is read by
  scanning a sorted column. It earns the row with a `<CellMeter>` of the current interval and
  a relative countdown; the previous occurrence is measured from the anchor exactly as
  postings are, so the meter and the schedule can never describe different cycles.
- **Transactions** — a real table, because the rows are homogeneous and comparable field by
  field. This is the one place the row form is right. No totals row: the figure a month adds
  up to is the dashboard's job, and a sum under a filtered table invites reading it as the
  month's.

Every interactive component owes default / hover / focus / active / disabled / loading /
error. Loading is a `GridMarkPulse`, not a spinner in the middle of content.

## Motion

Durations and easings live in `src/lib/motion.ts` and mirror CSS custom properties.

- `--ease-out-brand: cubic-bezier(0.22, 1, 0.36, 1)` for anything entering or responding.
- `--ease-in-out-brand: cubic-bezier(0.65, 0, 0.35, 1)` for on-screen movement.
- Durations: instant 120ms, fast 180ms, base 260ms, slow 420ms. Springs
  (`stiffness: 420, damping: 34`) only where something physically moves, e.g. the shared
  `layoutId` nav pill.
- The modal veil blurs the ground (`backdrop-filter: blur(10px)`), ramping from 0 in the
  keyframe: at 50% black alone the dashboard behind stays legible and competes with the panel.
- Overlays are keyframes, not transitions, because Radix waits on `animationend`:
  `.anim-veil` / `.anim-modal` / `.anim-pop`. Enter and exit are asymmetric (modal 220 /
  140ms, popover 150 / 110ms). Popovers scale from their trigger; modals stay centred.
- Press feedback is `active:scale-[0.97]` on buttons, `0.98` on rows. Tailwind v4 emits the
  `scale` property, so transitions must name `scale`, not `transform`.
- Hover uses the `hoverfine` / `group-hoverfine` custom variants, which gate on
  `(hover: hover) and (pointer: fine)`. Tailwind's own `hover:` emits a bare `:hover`,
  which a touch device fires on tap and leaves stuck.
- ECharts takes explicit durations and easing from `src/lib/charts.ts`; library defaults
  feel mushy.
- Never animate a keyboard-initiated action. ⌘K carries `.anim-none`.
- Reduced motion keeps opacity and colour transitions at 140ms and removes movement.
