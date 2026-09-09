import { format, parseISO, subMonths } from 'date-fns'
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
