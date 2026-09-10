# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Design source

`DESIGN.md` and the "Brand tokens" section below are the authoritative design
reference in this repo. The original brand mockup this was designed from
isn't checked in; `src/components/brand/DitherField.tsx`'s Bayer-dither
implementation and the tokens in `src/styles/globals.css` are the source of
truth for anyone continuing the visual work.

## Commands

```
npm run dev           # Worker (wrangler dev, local D1, :8787) + Vite (:5173) together; Vite proxies /api
npm run build         # tsc -b && vite build
npm run deploy:api     # wrangler deploy — the Hono API + D1, to Workers
npm run deploy:web     # build, then wrangler pages deploy dist — the frontend, to Pages
npm run lint          # oxlint
npm run typecheck     # tsc -b --noEmit
npm test              # vitest run — inside the Workers runtime, real D1 binding
npx vitest run tests/ledger.test.ts -t "is idempotent"   # a single test
npm run db:migrate           # apply pending migrations to local D1
npm run db:migrate:remote    # apply pending migrations to the deployed D1 database
npm run db:reset             # wipe local D1, migrate, seed ~8 months of demo data
npm run db:reset -- --empty  # wipe and migrate only — for checking empty states
npm run icons         # regenerate PWA icons from the grid mark
```

Local dev runs against D1 too (Wrangler's local emulation, persisted at
`.wrangler/state`), not a separate Node driver — one code path, so dev never
runs anything production doesn't.

## Product shape

Single-user personal expense tracker. Web app now, PWA for mobile later.

- **Phase 1 is desktop-only.** Build PWA infrastructure now (manifest, service worker registration, installability) but no mobile-specific layouts or input flows.
- **No authentication, no RLS in the app itself.** Still single-user by design — don't add a login screen or per-row ownership. Now that the app is deployed on Pages/Workers rather than run locally, the gate is **Cloudflare Access** (a dashboard policy in front of the Pages domain and the Worker route, free tier), not application code. Schema comments should still flag the no-RLS assumption for anyone who does turn this multi-user later.
- **Single currency: EUR (€).** No conversion logic. (The brand guidelines mockup shows `$` — ignore that; it predates the currency decision.)
- Top priority is that it feels smooth, polished and snappy. Revolut and similar fintech apps are the reference for visual language and interaction patterns.

## Tech stack and where each piece belongs

The division of labor between UI libraries is deliberate — respect it rather than reaching for whichever is nearest:

- **shadcn/ui** — functional components: forms, dialogs, dropdowns, core tables. Keeps dense dashboard views calm.
- **Aceternity UI** — accent/decorative only: hero moments (the net worth number), empty states, backgrounds. Not for every widget.
- **Motion** (formerly Framer Motion) — hover states, layout transitions, page transitions.
- **pqoqubbw/icons** — animated Lucide icons via the shadcn CLI, for icon micro-interactions.
- **ECharts** via `echarts-for-react` — all charts. Set explicit animation durations/easing; the library defaults feel mushy.
- **TanStack Query** over `src/lib/api.ts`, with optimistic updates so the UI reacts before the round-trip resolves.
- **TanStack Table** — the filterable monthly tables. Virtualization is deferred until row counts justify it.
- **zod** — `shared/schemas.ts` validates on the server and types the client. Simple dialogs use local state; reach for react-hook-form when a form outgrows it.
- **cmdk** — command palette (⌘K / Ctrl+K) plus a visible trigger button.
- **Hono on Cloudflare Workers + D1** — the API is a Worker (`server/index.ts`); Pages serves the built frontend. Pages and the Worker are different origins — Pages' `_redirects` can only rewrite to relative paths, it cannot proxy to an external one — so the client calls the Worker's URL directly (`src/lib/api.ts`, `VITE_API_URL`) and the Worker allows it with CORS.

`prefers-reduced-motion` must be respected throughout; this UI is animation-heavy enough that ignoring it is a real accessibility failure.

## Architecture

```
wrangler.toml   <- Worker + D1 binding (DB) + Cron Trigger for jobs.ts
server/         <- Hono, on Workers; api.ts routes, queries.ts SQL, jobs.ts scheduler
scripts/        <- Node-side tooling (db-reset, db-seed) — real D1 via wrangler's getPlatformProxy
shared/         <- zod schemas + types, imported by BOTH sides
src/            <- React 19, TanStack Query; deploys to Pages
```

D1 is **async and positional-only** (`db.prepare(sql).bind(...).all()` — no
`@name` params, unlike better-sqlite3) and has **no imperative
`db.transaction(fn)`**: atomicity comes from collecting bound statements and
calling `db.batch([...])` once (see `jobs.ts`'s `postDueRecurring`). Keep
that shape rather than reaching for a per-statement transaction wrapper that
doesn't exist here.

`server/**` is typechecked against `@cloudflare/workers-types` only (see
`tsconfig.worker.json`) — no Node globals (`process`, `fs`, ...) exist at
runtime there. `scripts/**` shares that project (plus `"node"` types) because
`db-reset.ts`/`db-seed.ts` import `server/db.ts` and `server/jobs.ts`
directly; `tsconfig.node.json` covers everything else Node-side.

Server code uses **relative imports** (`../shared/…`) because tsx/Wrangler do not resolve the `@shared` alias from the solution-style root tsconfig; only client code, bundled by Vite, uses `@/` and `@shared/`.

Three conventions worth knowing before editing:

- **Money is `INTEGER` cents everywhere.** SQLite has no exact decimal type. Convert only at the display edge, via `src/lib/format.ts`.
- **Columns are camelCase**, so a row deserialises straight into the API shape and there is no mapping layer to drift.
- **Migrations** are `migrations/NNNN_*.sql` (Wrangler's 4-digit convention), applied via `wrangler d1 migrations apply` (see Commands above) rather than a hand-rolled runner. Add files; never edit an applied one.

## Data model

**Accounts** — name, icon, initial balance. All accounts contribute positively to net worth (no credit-card-style negative balances). **Soft delete**: a deleted account vanishes from active views (account list, quick actions, transaction/transfer forms) but its historical transactions and transfers stay intact and must keep rendering correctly in past reports and tables.

**Categories** — separate expense and income lists, each with name + icon. Also **soft delete**, for the same reason: existing transactions keep their category so historical reports stay accurate.

**Budgets** — tied to expense categories. Reset monthly, **no rollover**. A limit is a standing figure on the category, not a row per month, so the Budgets screen carries no month picker and no spend: the only month-scoped figure `budgetStatus` returns is `spentCents`, which is the dashboard's panel, not this screen's. Don't reintroduce a month there.

**Transactions** — date, category, account, amount, and an optional **name**: the label the row is recognised by ("Mercadona", "Rent"), not a remark. Tables lead with it and fall back to the category name when it is absent. Deletion is a **hard delete** (a single transaction isn't a shared reference).

**Transfers** — move funds between accounts, affecting both balances but **excluded from all income/expense analytics**. These keep an optional `note` rather than a name: a transfer has no identity to name, it is two accounts and an amount. This is enforced structurally: transfers live in their own table, so analytics read `transactions` only and the rule cannot be forgotten in one query. Keep it that way — do not model a transfer as a transaction kind.

**Recurring transactions / subscriptions** — frequency + start date, for both income and expenses. Editing a series affects **future occurrences only**; already-posted transactions are untouched. Deleting a series stops future postings and leaves posted history intact.

**Net worth snapshots** — sum of non-deleted account balances, keyed to the first of each month, holding the value as of that month's end (or today for the month in progress). The chart reads snapshots; it must not recompute from full history on load.

**Investment portfolio** — a MyInvestor order history (`funds`, `investmentOrders`, `fundPrices`), deliberately unconnected to accounts or net worth: it is its own surface with its own value, not a balance folded into the ledger. An order's `kind` is `buy`, `sell`, `transferIn` or `transferOut`; the last two are MyInvestor "traspasos" and fund switches, which move a fund's own shares and cost basis but carry no external cash — `netContributedCents` and `monthlyContributions` (`server/portfolio.ts`) read `buy`/`sell` only, the same structural separation transfers get in the main ledger. Shares are `shareUnits` (× 1e8) and NAVs are `navMicros` (× 1e6), stored as exact scaled integers so a fully-sold position closes to precisely zero rather than a float residue — see `shared/brokerOrders.ts`'s `parseScaledDecimal`. Prices come from the Financial Times' unofficial fund-tearsheet and history endpoints (`server/prices.ts`, `syncFundPrices`), throttled to once per 4 hours and resolved by ISIN once per fund; a fund FT can't resolve (or a date it hasn't priced) falls back to the NAV recorded on its own order (`fundPrices.source = 'order'`, always overwritten once `'ft'` lands).

## Scheduled work — `server/jobs.ts`

Runs in the API process on boot and every 30 minutes, and is exposed at `POST /api/jobs/run`. Cron would be wrong here: the machine is often asleep when something falls due, so jobs instead catch up whatever was missed.

Three steps, in order: post due recurring transactions, sync fund prices, then backfill net worth snapshots. The two are independent of each other — fund prices never feed net worth — but share the one scheduled entry point.

Two invariants hold the recurring side together, and both have tests:

- **Idempotency** comes from a partial unique index on `transactions(recurringRuleId, occurredOn)`. Re-running can never double-post.
- **Occurrence dates are computed as the *n*th step from `startDate`**, never by advancing a cursor — see `shared/recurrence.ts`. Advancing clamps a Jan-31 rule to Feb 28 and it never recovers the 31st.

The price sync has its own: **idempotency** from `fundPrices`' `(isin, pricedOn)` primary key with an upsert, and a **throttle** (`meta.pricesSyncedAt`) so a fund's once-a-day NAV isn't refetched every 30 minutes.

## Analytics surface

Net worth over time (from snapshots); monthly income; monthly expense; monthly balance (income − expense); expense-by-category and income-by-category pie charts for a month-picker-selected month; account balances as a share of net worth (100 cells, one per percent, via `<ShareGrid>`);
current-month budget status (spent vs. budget per category); filterable tables of the month's expenses, income and transfers, on `/transactions` via `<DataTable>` and `<FilterBar>`.

Filtering is done by the API, not by the table: the server already takes month, kind, account,
category and search, and filtering the page of rows the client happens to hold would disagree
with the totals underneath it. Sorting is the table's.

## Empty states

Every chart, table and panel needs a **designed** empty state for a brand-new setup — icon or small illustration, short copy, and a clear CTA ("Add your first account"), styled to the brand. A bare "no data" placeholder is not acceptable; the app must look intentional before any real data exists.

## Brand tokens

Defined as CSS variables in `src/styles/globals.css` and consumed through shadcn's semantic names. Both themes ship: dark is the brand as specified, light is a documented derivation.

**Colour** — proportion is roughly 78 Carbon / 18 Paper / 4 Emerald. Emerald is the only saturated thing on screen; spend it like currency.

| Token | Hex | Use |
|---|---|---|
| Carbon | `#080A09` | Page ground (near-black with green in it) |
| Carbon 2 | `#151816` | Cards, raised surfaces |
| Paper | `#EEF1EE` | Text, inverted surfaces |
| Posted Emerald | `#00B36B` | The posted cell; accents, links |
| Emerald Deep | `#0A5C3A` | Dither fields only |

Hairlines are `1px rgba(255,255,255,.10–.14)`. Muted body text is Paper at 55–65% opacity. Mono micro-labels are `rgba(255,255,255,.5)`, uppercase, letter-spacing `.10–.14em`. Radii run 14 / 16 / 20 / 24 / 32px.

**Type** — Instrument Sans (500/600/700) for voice; DM Mono (400/500) for figures, timestamps and labels — anything that belongs in a cell. All monetary amounts are DM Mono.

- Display: 700, letter-spacing −0.04em
- Heading: 600, ~24px, −0.015em
- Body: 500, ~16px/1.55
- Figures: DM Mono 500, letter-spacing .02em

**The Grid (logo)** — a 3×3 block of cells: cell = 5 units, gap = 1 unit, radius = 1 unit. The bottom-right cell is always Emerald — that's where a total lives. Clear space = 1 cell. Never scale non-uniformly; never add a tenth cell. It survives to 14px because every cell is a plain square. The grid doubles as UI: progress is literally cells filling.

**Material** — backgrounds are ordered-dither (Bayer 4×4) fields on canvas with `image-rendering: pixelated` (`DitherField`). In light mode the ink inverts to Carbon so the texture reads as shadow on Paper rather than glow on Carbon.

**Light-mode rule that is not a straight inversion:** `#00B36B` on Paper is ~2.3:1 and fails as text, so light mode reads in Emerald Deep `#0A5C3A` (`--accent-ink`) and reserves bright Emerald for fills and chart marks.

## Chart palette

`--chart-1..7` are **not** brand tints. Nine shades of emerald are unreadable as a category encoding, so the palette is emerald-anchored (slot 1 is Emerald) and then spreads across hues, generated in OKLCH and validated with the `dataviz` skill's `validate_palette.js` against both surfaces — lightness band, chroma floor, CVD adjacency, normal-vision floor, contrast. **Re-run that validator if you change them.** Assign in fixed order, never cycled; an eighth category folds into `--chart-other`, it does not get a new hue. Hues 180–225 are unusable — sRGB cannot reach the chroma floor there.

`--chart-cat-1..5` is a second, **category-safe** set, and it is the one to reach for whenever the thing being encoded is arbitrary — a category, an account, a recurring rule. Red, green and blue are excluded from it on purpose: those three are direction inks (`--negative`, `--positive`, `--transfer`), so a category wearing one reads as a direction. One family per slot: orange, purple, teal, brown, pink. It passes every check on **`--pairs all`**, not just adjacency (worst pair ΔE 17.1 light / 16.5 dark against a floor of 15).

**There are five slots because five is the most that can be told apart** once red, green and blue are gone — a measured result, not a style choice: seven hues top out at a worst pair of ΔE 7.5 and six at 11.1. **Don't add a sixth by appending a hue**; that reintroduces the near-duplicate pair the five-slot search exists to avoid. Fold at `CATEGORICAL_SLOTS` from `src/lib/charts.ts` rather than hard-coding a count, and note `--chart-other` is a separate token, so "Other" is an extra wedge and spends no hue. Grey can never be a slot (chroma 0 fails the floor); teal only works above L 0.58, where sRGB just reaches the floor. Use `--chart-1..7` only where the hue means a direction (the net worth line, the income and expense flow lines).

Charts register only the ECharts pieces they use (`src/components/charts/Chart.tsx`) to keep the bundle down, and take explicit animation durations from `src/lib/charts.ts`.

## Code style

Minimize comments. Explain non-obvious logic only — never restate what the code visibly does.

## Screens

Dashboard, Transactions, Accounts, Categories, Budgets, Recurring and Investments are built.
Routes are code-split (`React.lazy` in `src/App.tsx`, one `<Suspense>` boundary in `AppShell`):
the dashboard alone pulls in ECharts and the tables pull in TanStack Table, so loading both up
front would make the first paint wait on code the screen in front of you does not use.

**Investments** (`src/pages/Investments.tsx`, `src/features/investments/`) reads the order
history: allocation (actual, via `<ShareGrid>`, and target vs. actual with per-fund drift),
portfolio value and time-weighted return over a range, monthly contributions, and a per-fund
price chart with buy/sell markers. Orders arrive by uploading MyInvestor's `.xls` export
(`parseOrdersXls.ts` parses it client-side into the same shape `shared/brokerOrders.ts` tests
against; the Worker only ever receives validated JSON) and import is idempotent on the broker's
own operation id, so re-uploading an overlapping export is safe.

Two conventions hold across the management screens:

- **An edit never moves a record between tables.** Transfers and transactions are separate
  tables by design, and a transaction's kind is fixed once it exists, because changing it
  would strand the category it is filed under. Both are delete-and-re-add, so the entry
  dialog hides its mode switcher when editing rather than offering a move it cannot make.
- **Archiving is explained, not just confirmed.** A soft delete and a hard delete look
  identical at the moment of clicking, so every `<ConfirmDialog>` says what actually survives:
  which pickers the record leaves, what happens to its history, and what gets paused.

Editing a historical row can point at an archived account or category, so the entry and
recurring dialogs fetch with `includeDeleted` and filter the archived rows back out except
the one the record already holds. Otherwise the pick silently disappears from its own form.

## Out of scope for this phase

Mobile-optimized UI and quick-input flows. The **Goals**, **AI agent**, **Integrations** and
**Reports** routes exist as placeholder tabs so the nav is complete, but none is built, Goals
has no data model at all, and the MCP server is unwritten. Don't build toward them speculatively.
