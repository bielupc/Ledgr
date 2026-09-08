# Product

## Register

product

Qualifier: the Dashboard is treated as a showpiece surface. It carries brand-register
ambition (hero moments, expressive motion, designed empty states) while every other
screen stays utilitarian. Craft budget is spent on the Dashboard first.

## Users

One person: the owner of the ledger. Desktop, at a real desk, deliberately sitting down
to see where the money went. Not a glance on a phone between meetings, and not a team.

The job: answer "am I fine?" in under five seconds, then drill into why. They already know
their own accounts and categories, so the interface never has to teach them the domain,
only show them the state of it. They are the same person who entered the data, which
means every figure on screen is one they can already check against memory. Getting a
number subtly wrong is worse than showing no number.

Phase 1 is desktop-only. PWA infrastructure ships now; mobile-specific UX does not.

## Product Purpose

Track personal expenses without ceremony. Accounts, categories, budgets, transactions,
transfers and recurring rules, over a local SQLite file with no auth and no cloud.

Success: the Dashboard answers the money question on load, without a click. Everything
else on the surface exists to explain that answer. The app should feel like an instrument
the owner reads, not a service that reports to them.

## Brand Personality

**Precise, calm, alive.**

- **Precise** — figures are exact and monospaced, alignment is real, nothing is
  approximate. A rounded number is a lie about certainty.
- **Calm** — Emerald is the only saturated thing on screen (78 Carbon / 18 Paper /
  4 Emerald). Density without noise. The interface never raises its voice about money.
- **Alive** — surfaces respond. Hover reveals, figures roll, cells fill. Restraint is not
  the same as inertness, and this is where the current build is weakest.

Voice is the guidelines' own: terse and declarative. *"Nine cells. Eight filed. One just
landed."* Short sentences. No filler, no encouragement, no exclamation.

## Anti-references

- **Generic SaaS dashboard.** Rounded cards in a uniform grid, icon + label + number,
  soft drop shadows, pastel progress bars, every panel the same shape and weight. This is
  the trap the current Balances and Budget panels have fallen into.
- **Bank statement.** Dense grey rows, no hierarchy, everything at one weight, zero
  motion, magnitude invisible until you read every figure.
- Also out: crypto/neon fintech chrome (glow, glass, gradients) and consumer-budgeting
  friendliness (illustrations, emoji categories, encouraging copy).

## Design Principles

1. **The grid is the language.** The 3×3 mark, dither fields and cell-stepped motion are
   one system, not decoration. Progress is literally cells filling. Reach for the grid
   before reaching for a generic bar or ring.
2. **Magnitude before digits.** A row should communicate relative size pre-attentively,
   so the eye ranks accounts and budgets before it reads a single number. The figure
   confirms; it does not carry the ranking alone.
3. **Spend Emerald like currency.** One saturated colour, used for the posted cell, the
   accent and the current state. Never for decoration, never on an inactive state.
4. **Motion conveys state, or it is cut.** Hover, press, arrival, change. No orchestrated
   page-load choreography, no animation on an action repeated a hundred times a day
   (⌘K opens instantly and always will).
5. **Earned familiarity, then one surprise.** Standard affordances everywhere so the tool
   disappears into the task; the Dashboard is allowed exactly one moment that isn't
   standard, and it is the net worth hero.

## Accessibility & Inclusion

- `prefers-reduced-motion` is respected throughout, and means *gentler*, not *none*:
  opacity and colour transitions survive, movement is removed. Motion's own animations
  route through `<MotionConfig reducedMotion="user">`.
- Body text ≥ 4.5:1, large text ≥ 3:1. The documented consequence: Emerald `#00B36B` on
  Paper is ~2.3:1 and fails as text, so light mode reads in Emerald Deep (`--accent-ink`)
  and reserves bright Emerald for fills and chart marks.
- The categorical chart palette is validated for colour-vision deficiency, not eyeballed
  (lightness band, chroma floor, CVD adjacency ΔE, normal-vision floor, contrast) against
  both surfaces. Re-run the validator on any change.
- Category identity is never colour-alone: every multi-series chart carries a legend with
  names and figures beside the swatch.
- Both themes ship. Dark is the brand as specified; light is a documented derivation.
