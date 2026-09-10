import { addDays, format, parseISO, subMonths } from 'date-fns'
import { newId, today, type DB } from '../server/db.ts'
import { runJobs } from '../server/jobs.ts'

/** Deterministic, so a reset always produces the same demo ledger. */
function rng(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const MONTHS_OF_HISTORY = 8

interface SeedAccount {
  key: string
  name: string
  icon: string
  initialBalanceCents: number
  deleted?: boolean
}

interface SeedCategory {
  key: string
  name: string
  icon: string
  kind: 'expense' | 'income'
  color: string
  deleted?: boolean
}

const ACCOUNTS: SeedAccount[] = [
  { key: 'current', name: 'Current Account', icon: 'landmark', initialBalanceCents: 240_000 },
  { key: 'savings', name: 'Savings', icon: 'piggy-bank', initialBalanceCents: 1_180_000 },
  { key: 'cash', name: 'Cash', icon: 'banknote', initialBalanceCents: 18_000 },
  { key: 'broker', name: 'Brokerage', icon: 'chart-line', initialBalanceCents: 640_000 },
  // Proves soft delete: gone from pickers, still named in its old rows.
  { key: 'old', name: 'Old Wallet', icon: 'wallet', initialBalanceCents: 5_000, deleted: true },
]

const CATEGORIES: SeedCategory[] = [
  { key: 'groceries', name: 'Groceries', icon: 'shopping-cart', kind: 'expense', color: '#00B36B' },
  { key: 'rent', name: 'Rent', icon: 'house', kind: 'expense', color: '#0A5C3A' },
  { key: 'transport', name: 'Transport', icon: 'bus', kind: 'expense', color: '#3FCB8E' },
  { key: 'dining', name: 'Dining', icon: 'utensils', kind: 'expense', color: '#7FDCB0' },
  { key: 'utilities', name: 'Utilities', icon: 'zap', kind: 'expense', color: '#1E8A5F' },
  { key: 'subs', name: 'Subscriptions', icon: 'repeat', kind: 'expense', color: '#5FB894' },
  { key: 'health', name: 'Health', icon: 'heart-pulse', kind: 'expense', color: '#A8E6C9' },
  { key: 'shopping', name: 'Shopping', icon: 'shopping-bag', kind: 'expense', color: '#2FA97A' },
  { key: 'travel', name: 'Travel', icon: 'plane', kind: 'expense', color: '#96D9BC' },
  { key: 'gym', name: 'Gym', icon: 'dumbbell', kind: 'expense', color: '#6ECFA4', deleted: true },
  { key: 'salary', name: 'Salary', icon: 'briefcase', kind: 'income', color: '#00B36B' },
  { key: 'freelance', name: 'Freelance', icon: 'laptop', kind: 'income', color: '#3FCB8E' },
  { key: 'interest', name: 'Interest', icon: 'percent', kind: 'income', color: '#7FDCB0' },
]

const VARIABLE_SPEND: {
  category: string
  perMonth: number
  min: number
  max: number
  names: string[]
}[] = [
  { category: 'groceries', perMonth: 8, min: 1_400, max: 9_200, names: ['Mercadona', 'Consum', 'Market stall', 'Bakery'] },
  { category: 'dining', perMonth: 6, min: 1_100, max: 6_800, names: ['Lunch', 'Dinner out', 'Coffee', 'Tapas'] },
  { category: 'transport', perMonth: 5, min: 200, max: 4_200, names: ['Metro top-up', 'Taxi', 'Fuel', 'Bike repair'] },
  { category: 'shopping', perMonth: 3, min: 1_800, max: 12_500, names: ['Clothes', 'Homeware', 'Books', 'Headphones'] },
  { category: 'health', perMonth: 1, min: 1_900, max: 8_400, names: ['Pharmacy', 'Dentist', 'Optician'] },
  { category: 'utilities', perMonth: 2, min: 3_400, max: 11_800, names: ['Electricity', 'Water', 'Internet'] },
]

/*
 * Builds every insert as a bound statement and runs them all in one
 * db.batch() call — D1 has no imperative db.transaction(fn), and this data
 * has no cross-statement DB reads (account/category ids come from the Maps
 * populated in the same pass), so it fits the same pattern jobs.ts uses for
 * postDueRecurring.
 */
export async function seed(db: DB): Promise<void> {
  const random = rng(20260908)
  const now = today()
  const firstMonth = format(subMonths(parseISO(`${now.slice(0, 7)}-01`), MONTHS_OF_HISTORY - 1), 'yyyy-MM')

  const accountIds = new Map<string, string>()
  const categoryIds = new Map<string, string>()
  const ops: D1PreparedStatement[] = []

  ACCOUNTS.forEach((account, index) => {
    const id = newId()
    accountIds.set(account.key, id)
    ops.push(
      db
        .prepare(
          `INSERT INTO accounts (id, name, icon, initialBalanceCents, sortOrder, deletedAt)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          account.name,
          account.icon,
          account.initialBalanceCents,
          index,
          account.deleted ? '2026-02-01 09:00:00' : null,
        ),
    )
  })

  CATEGORIES.forEach((category, index) => {
    const id = newId()
    categoryIds.set(category.key, id)
    ops.push(
      db
        .prepare(
          `INSERT INTO categories (id, name, icon, kind, color, sortOrder, deletedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          category.name,
          category.icon,
          category.kind,
          category.color,
          index,
          category.deleted ? '2026-03-01 09:00:00' : null,
        ),
    )
  })

  const current = accountIds.get('current')!
  const savings = accountIds.get('savings')!
  const cash = accountIds.get('cash')!
  const old = accountIds.get('old')!

  const insertRule = (rule: {
    kind: 'income' | 'expense'
    amountCents: number
    accountId: string
    categoryId: string | undefined
    name: string
    startDate: string
  }) =>
    ops.push(
      db
        .prepare(
          `INSERT INTO recurringRules
             (id, kind, amountCents, accountId, categoryId, name, frequency,
              intervalCount, startDate, occurrenceIndex, nextRunOn, isActive)
           VALUES (?, ?, ?, ?, ?, ?, 'monthly', 1, ?, 0, ?, 1)`,
        )
        .bind(
          newId(),
          rule.kind,
          rule.amountCents,
          rule.accountId,
          rule.categoryId ?? null,
          rule.name,
          rule.startDate,
          rule.startDate,
        ),
    )

  const insertTransaction = (t: {
    kind: 'income' | 'expense'
    occurredOn: string
    amountCents: number
    accountId: string
    categoryId: string | undefined
    name: string | null
  }) =>
    ops.push(
      db
        .prepare(
          `INSERT INTO transactions (id, kind, occurredOn, amountCents, accountId, categoryId, name, icon)
           VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
        )
        .bind(newId(), t.kind, t.occurredOn, t.amountCents, t.accountId, t.categoryId ?? null, t.name),
    )

  const insertTransfer = (t: {
    occurredOn: string
    amountCents: number
    fromAccountId: string
    toAccountId: string
    note: string
  }) =>
    ops.push(
      db
        .prepare(
          `INSERT INTO transfers (id, occurredOn, amountCents, fromAccountId, toAccountId, note)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(newId(), t.occurredOn, t.amountCents, t.fromAccountId, t.toAccountId, t.note),
    )

  // Fixed commitments are expressed as rules and posted by runJobs below, so
  // the seeded history is produced by the same code path the app uses live.
  insertRule({
    kind: 'income', amountCents: 285_000, accountId: current,
    categoryId: categoryIds.get('salary'), name: 'Monthly salary', startDate: `${firstMonth}-25`,
  })
  insertRule({
    kind: 'expense', amountCents: 98_000, accountId: current,
    categoryId: categoryIds.get('rent'), name: 'Flat', startDate: `${firstMonth}-01`,
  })
  insertRule({
    kind: 'expense', amountCents: 1_399, accountId: current,
    categoryId: categoryIds.get('subs'), name: 'Netflix', startDate: `${firstMonth}-08`,
  })
  insertRule({
    kind: 'expense', amountCents: 1_099, accountId: current,
    categoryId: categoryIds.get('subs'), name: 'Spotify', startDate: `${firstMonth}-14`,
  })
  insertRule({
    kind: 'income', amountCents: 2_400, accountId: savings,
    categoryId: categoryIds.get('interest'), name: 'Savings interest', startDate: `${firstMonth}-28`,
  })

  for (let m = 0; m < MONTHS_OF_HISTORY; m += 1) {
    const monthDate = subMonths(parseISO(`${now.slice(0, 7)}-01`), MONTHS_OF_HISTORY - 1 - m)
    const month = format(monthDate, 'yyyy-MM')
    const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate()
    const isCurrentMonth = month === now.slice(0, 7)
    const lastDay = isCurrentMonth ? Number(now.slice(8, 10)) : daysInMonth

    for (const spend of VARIABLE_SPEND) {
      const count = Math.max(1, Math.round(spend.perMonth * (0.7 + random() * 0.6)))
      for (let i = 0; i < count; i += 1) {
        const day = 1 + Math.floor(random() * lastDay)
        if (day > lastDay) continue
        insertTransaction({
          kind: 'expense',
          occurredOn: `${month}-${String(day).padStart(2, '0')}`,
          amountCents: Math.round(spend.min + random() * (spend.max - spend.min)),
          accountId: random() < 0.18 ? cash : current,
          categoryId: categoryIds.get(spend.category),
          name: spend.names[Math.floor(random() * spend.names.length)] ?? null,
        })
      }
    }

    if (random() < 0.35) {
      insertTransaction({
        kind: 'expense',
        occurredOn: `${month}-${String(Math.min(lastDay, 12 + Math.floor(random() * 10))).padStart(2, '0')}`,
        amountCents: Math.round(8_000 + random() * 42_000),
        accountId: current,
        categoryId: categoryIds.get('travel'),
        name: ['Flights', 'Hotel', 'Train'][Math.floor(random() * 3)] ?? null,
      })
    }

    if (random() < 0.5) {
      insertTransaction({
        kind: 'income',
        occurredOn: `${month}-${String(Math.min(lastDay, 5 + Math.floor(random() * 20))).padStart(2, '0')}`,
        amountCents: Math.round(24_000 + random() * 66_000),
        accountId: current,
        categoryId: categoryIds.get('freelance'),
        name: 'Side project invoice',
      })
    }

    // Monthly sweep into savings and an ATM withdrawal that funds the cash
    // account. Internal movement — must never show up in the income/expense
    // charts, but it does have to keep Cash from going negative.
    insertTransfer({
      occurredOn: `${month}-${String(Math.min(lastDay, 26)).padStart(2, '0')}`,
      amountCents: Math.round(30_000 + random() * 25_000),
      fromAccountId: current,
      toAccountId: savings,
      note: 'Monthly sweep',
    })
    insertTransfer({
      occurredOn: `${month}-${String(Math.min(lastDay, 3)).padStart(2, '0')}`,
      amountCents: Math.round(22_000 + random() * 8_000),
      fromAccountId: current,
      toAccountId: cash,
      note: 'ATM withdrawal',
    })
  }

  // History belonging to soft-deleted records, to prove it still renders.
  insertTransaction({
    kind: 'expense', occurredOn: `${firstMonth}-06`,
    amountCents: 4_200, accountId: old, categoryId: categoryIds.get('groceries'), name: 'Corner shop',
  })
  insertTransaction({
    kind: 'expense', occurredOn: `${firstMonth}-19`,
    amountCents: 3_500, accountId: current, categoryId: categoryIds.get('gym'), name: 'Monthly pass',
  })

  for (const [key, amount] of [
    ['groceries', 45_000],
    ['dining', 20_000],
    ['transport', 12_000],
    ['shopping', 18_000],
    ['utilities', 15_000],
    ['subs', 4_000],
  ] as const) {
    ops.push(
      db
        .prepare(`INSERT INTO budgets (id, categoryId, amountCents) VALUES (?, ?, ?)`)
        .bind(newId(), categoryIds.get(key), amount),
    )
  }

  await db.batch(ops)
  await runJobs(db)
}

// Scale factors matching migrations/0005_investments.sql / server/portfolio.ts.
const SHARE_SCALE = 100_000_000
const NAV_SCALE = 1_000_000

const INVESTMENT_MONTHS = 14
/** Chunk size for the fundPrices batch — a few hundred proven safe by the
 *  ledger seed's single batch above, but this is an order of magnitude more
 *  rows, so it's split rather than assumed to fit in one `db.batch()` call. */
const PRICE_BATCH_SIZE = 300

interface SeedFund {
  isin: string
  name: string
  shortName: string
  targetBps: number
  startPrice: number
  dailyDrift: number
  dailyVol: number
  monthlyAmountCents: number
}

const FUNDS: SeedFund[] = [
  {
    isin: 'DEMO00000001',
    name: 'Global Equity Index Fund',
    shortName: 'Global Equity',
    targetBps: 3000,
    startPrice: 42,
    dailyDrift: 0.00035,
    dailyVol: 0.008,
    monthlyAmountCents: 25_000,
  },
  {
    isin: 'DEMO00000002',
    name: 'European Value Fund',
    shortName: 'European Value',
    targetBps: 2000,
    startPrice: 68,
    dailyDrift: 0.00022,
    dailyVol: 0.006,
    monthlyAmountCents: 15_000,
  },
  {
    isin: 'DEMO00000003',
    name: 'Emerging Markets Growth Fund',
    shortName: 'EM Growth',
    targetBps: 2000,
    startPrice: 21,
    dailyDrift: 0.0004,
    dailyVol: 0.014,
    monthlyAmountCents: 15_000,
  },
  {
    isin: 'DEMO00000004',
    name: 'Green Energy Transition Fund',
    shortName: 'Green Energy',
    targetBps: 1500,
    startPrice: 15,
    dailyDrift: 0.0003,
    dailyVol: 0.017,
    monthlyAmountCents: 10_000,
  },
  {
    isin: 'DEMO00000005',
    name: 'Global Bond Aggregate Fund',
    shortName: 'Global Bonds',
    targetBps: 1500,
    startPrice: 95,
    dailyDrift: 0.0001,
    dailyVol: 0.002,
    monthlyAmountCents: 10_000,
  },
]

/** A daily random-walk price series from `startDate` through `endDate`
 *  inclusive, keyed by date — floored well above zero so a run of bad noise
 *  can't ever produce a non-positive price (the `navMicros`/`amountCents`
 *  columns are `CHECK (... > 0)`). */
function buildPriceSeries(
  fund: SeedFund,
  startDate: string,
  endDate: string,
  random: () => number,
): Map<string, number> {
  const series = new Map<string, number>()
  let price = fund.startPrice
  let cursor = parseISO(startDate)
  const end = parseISO(endDate)
  while (cursor <= end) {
    series.set(format(cursor, 'yyyy-MM-dd'), price)
    const noise = (random() - 0.5) * 2 * fund.dailyVol
    price = Math.max(fund.startPrice * 0.15, price * (1 + fund.dailyDrift + noise))
    cursor = addDays(cursor, 1)
  }
  return series
}

/**
 * Funds, orders and daily prices for a fictional 5-fund portfolio — the
 * ledger's `seed()` above has no opinion on investments, so this is a
 * separate pass. Prices are generated first and orders are derived from them
 * (an order's own navMicros/shareUnits/amountCents all read off that day's
 * point in the same series), so every order is internally consistent with
 * its fund's price history by construction. `ftXid` is pinned to a sentinel
 * at insert time so `runJobs`' price sync (called below, same as the ledger
 * seed) never attempts to resolve these fictional ISINs against the real
 * Financial Times feed — the same fix just applied to the one prod fund
 * whose real order data turned out incompatible with its real FT price.
 */
export async function seedInvestments(db: DB): Promise<void> {
  const random = rng(20260910)
  const now = today()
  const startDate = format(subMonths(parseISO(now), INVESTMENT_MONTHS), 'yyyy-MM-dd')

  const priceSeries = new Map<string, Map<string, number>>()
  for (const fund of FUNDS) {
    priceSeries.set(fund.isin, buildPriceSeries(fund, startDate, now, random))
  }

  const setupOps: D1PreparedStatement[] = []
  for (const fund of FUNDS) {
    setupOps.push(
      db
        .prepare(
          `INSERT INTO funds (isin, name, shortName, ftXid, resolvedAt, targetBps, sortOrder)
           VALUES (?, ?, ?, 'demo-seed', datetime('now'), ?, ?)`,
        )
        .bind(fund.isin, fund.name, fund.shortName, fund.targetBps, FUNDS.indexOf(fund)),
    )
  }

  for (let m = 0; m < INVESTMENT_MONTHS; m += 1) {
    const monthDate = subMonths(parseISO(`${now.slice(0, 7)}-01`), INVESTMENT_MONTHS - 1 - m)
    const monthStr = format(monthDate, 'yyyy-MM')
    const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate()
    const isCurrentMonth = monthStr === now.slice(0, 7)
    const lastDay = isCurrentMonth ? Number(now.slice(8, 10)) : daysInMonth
    if (lastDay < 1) continue

    for (const fund of FUNDS) {
      // Not every fund every month — a steady but uneven buying pattern
      // reads more like a real investor than a mechanical monthly ladder.
      if (random() < 0.3) continue

      const day = 1 + Math.floor(random() * lastDay)
      const dateStr = `${monthStr}-${String(day).padStart(2, '0')}`
      const price = priceSeries.get(fund.isin)!.get(dateStr)!

      const targetAmountCents = Math.round(fund.monthlyAmountCents * (0.7 + random() * 0.6))
      const shareUnits = Math.max(1, Math.round(((targetAmountCents / 100) * SHARE_SCALE) / price))
      const navMicros = Math.round(price * NAV_SCALE)
      const amountCents = Math.round((shareUnits / SHARE_SCALE) * (navMicros / NAV_SCALE) * 100)

      setupOps.push(
        db
          .prepare(
            `INSERT INTO investmentOrders
               (id, brokerOperationId, isin, kind, tradedOn, settledOn, shareUnits, navMicros, amountCents)
             VALUES (?, ?, ?, 'buy', ?, ?, ?, ?, ?)`,
          )
          .bind(newId(), newId(), fund.isin, dateStr, dateStr, shareUnits, navMicros, amountCents),
      )
    }
  }

  await db.batch(setupOps)

  const priceOps: D1PreparedStatement[] = []
  for (const fund of FUNDS) {
    for (const [dateStr, price] of priceSeries.get(fund.isin)!) {
      priceOps.push(
        db
          .prepare(
            `INSERT INTO fundPrices (isin, pricedOn, navMicros, source) VALUES (?, ?, ?, 'order')`,
          )
          .bind(fund.isin, dateStr, Math.round(price * NAV_SCALE)),
      )
    }
  }
  for (let i = 0; i < priceOps.length; i += PRICE_BATCH_SIZE) {
    await db.batch(priceOps.slice(i, i + PRICE_BATCH_SIZE))
  }

  await runJobs(db)
}
