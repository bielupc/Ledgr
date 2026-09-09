import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApi } from '../server/api.ts'
import { newId, type DB } from '../server/db.ts'
import {
  backfillNetWorthSnapshots,
  captureNetWorthSnapshot,
  postDueRecurring,
} from '../server/jobs.ts'
import {
  budgetStatus,
  dashboardSummary,
  listAccountBalances,
  listTransactions,
  monthlyTotals,
  netWorthAsOf,
  totalsByCategory,
} from '../server/queries.ts'
import type { TransactionQuery } from '../shared/schemas.ts'

const db: DB = env.DB

let current: string
let savings: string
let groceries: string
let salary: string

/*
 * Storage is isolated per test *file* under the Workers vitest plugin, not
 * per test the way better-sqlite3's fresh `:memory:` database used to be —
 * so every table gets wiped by hand before each test instead. Children
 * before parents, for the foreign keys.
 */
async function resetTables() {
  await db.batch([
    db.prepare('DELETE FROM transactions'),
    db.prepare('DELETE FROM transfers'),
    db.prepare('DELETE FROM recurringRules'),
    db.prepare('DELETE FROM budgets'),
    db.prepare('DELETE FROM netWorthSnapshots'),
    db.prepare('DELETE FROM categories'),
    db.prepare('DELETE FROM accounts'),
  ])
}

async function addAccount(name: string, initialBalanceCents: number, deleted = false) {
  const id = newId()
  await db
    .prepare(
      `INSERT INTO accounts (id, name, icon, initialBalanceCents, deletedAt)
       VALUES (?, ?, 'wallet', ?, ?)`,
    )
    .bind(id, name, initialBalanceCents, deleted ? '2026-01-01 00:00:00' : null)
    .run()
  return id
}

async function addCategory(name: string, kind: 'expense' | 'income', deleted = false) {
  const id = newId()
  await db
    .prepare(`INSERT INTO categories (id, name, icon, kind, deletedAt) VALUES (?, ?, 'tag', ?, ?)`)
    .bind(id, name, kind, deleted ? '2026-01-01 00:00:00' : null)
    .run()
  return id
}

async function addTransaction(
  kind: 'expense' | 'income',
  occurredOn: string,
  amountCents: number,
  accountId: string,
  categoryId: string | null,
) {
  const id = newId()
  await db
    .prepare(
      `INSERT INTO transactions (id, kind, occurredOn, amountCents, accountId, categoryId)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, kind, occurredOn, amountCents, accountId, categoryId)
    .run()
  return id
}

async function addTransfer(occurredOn: string, amountCents: number, from: string, to: string) {
  await db
    .prepare(
      `INSERT INTO transfers (id, occurredOn, amountCents, fromAccountId, toAccountId)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(newId(), occurredOn, amountCents, from, to)
    .run()
}

beforeEach(async () => {
  await resetTables()
  current = await addAccount('Current', 100_000)
  savings = await addAccount('Savings', 50_000)
  groceries = await addCategory('Groceries', 'expense')
  salary = await addCategory('Salary', 'income')
})

describe('account balances', () => {
  it('applies income, expense and both sides of a transfer', async () => {
    await addTransaction('income', '2026-03-01', 200_000, current, salary)
    await addTransaction('expense', '2026-03-02', 30_000, current, groceries)
    await addTransfer('2026-03-03', 25_000, current, savings)

    const balances = await listAccountBalances(db)
    const byName = new Map(balances.map((b) => [b.name, b.balanceCents]))

    expect(byName.get('Current')).toBe(100_000 + 200_000 - 30_000 - 25_000)
    expect(byName.get('Savings')).toBe(50_000 + 25_000)
  })

  it('hides soft-deleted accounts from the live list but keeps them retrievable', async () => {
    await addAccount('Old Wallet', 7_000, true)
    expect((await listAccountBalances(db)).map((a) => a.name)).not.toContain('Old Wallet')
    expect((await listAccountBalances(db, true)).map((a) => a.name)).toContain('Old Wallet')
  })
})

describe('analytics exclude transfers', () => {
  it('leaves transfer volume out of monthly income and expense', async () => {
    await addTransaction('income', '2026-03-01', 200_000, current, salary)
    await addTransaction('expense', '2026-03-02', 30_000, current, groceries)
    await addTransfer('2026-03-03', 90_000, current, savings)

    const [march] = await monthlyTotals(db, 1, '2026-03')
    expect(march?.incomeCents).toBe(200_000)
    expect(march?.expenseCents).toBe(30_000)
    expect(march?.balanceCents).toBe(170_000)
  })

  it('leaves transfers out of the category breakdown', async () => {
    await addTransaction('expense', '2026-03-02', 30_000, current, groceries)
    await addTransfer('2026-03-03', 90_000, current, savings)

    const totals = await totalsByCategory(db, '2026-03', 'expense')
    expect(totals).toHaveLength(1)
    expect(totals[0]?.totalCents).toBe(30_000)
  })

  it('leaves transfers out of budget spend', async () => {
    await db
      .prepare('INSERT INTO budgets (id, categoryId, amountCents) VALUES (?, ?, ?)')
      .bind(newId(), groceries, 50_000)
      .run()
    await addTransaction('expense', '2026-03-02', 30_000, current, groceries)
    await addTransfer('2026-03-03', 90_000, current, savings)

    const [status] = await budgetStatus(db, '2026-03')
    expect(status?.spentCents).toBe(30_000)
    expect(status?.budgetCents).toBe(50_000)
  })

  it('zero-fills months with no activity', async () => {
    await addTransaction('expense', '2026-03-02', 30_000, current, groceries)
    const series = await monthlyTotals(db, 3, '2026-03')
    expect(series.map((s) => s.month)).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(series[0]).toMatchObject({ incomeCents: 0, expenseCents: 0, balanceCents: 0 })
  })
})

/** The API always hands `listTransactions` a zod-parsed query; this fills in the
 *  same defaults for the tests that call it directly. */
function listQuery(overrides: Partial<TransactionQuery> = {}): TransactionQuery {
  return { limit: 100, offset: 0, sort: 'occurredOn', dir: 'desc', ...overrides }
}

describe('paginated lists', () => {
  it('pages without moving the count off the whole filter', async () => {
    for (let day = 1; day <= 5; day += 1) {
      await addTransaction('expense', `2026-03-0${day}`, day * 1_000, current, groceries)
    }

    const first = await listTransactions(db, listQuery({ month: '2026-03', limit: 2 }))
    expect(first.rows).toHaveLength(2)
    expect(first.total).toBe(5)

    const second = await listTransactions(db, listQuery({ month: '2026-03', limit: 2, offset: 2 }))
    expect(second.rows).toHaveLength(2)
    // Same count, different rows: `total` describes the filter, not the page.
    expect(second.total).toBe(5)
    expect(second.rows.map((r) => r.id)).not.toEqual(first.rows.map((r) => r.id))

    const last = await listTransactions(db, listQuery({ month: '2026-03', limit: 2, offset: 4 }))
    expect(last.rows).toHaveLength(1)
  })

  it('counts only what the filter selects', async () => {
    await addTransaction('expense', '2026-03-02', 4_000, current, groceries)
    await addTransaction('expense', '2026-03-03', 6_000, savings, groceries)

    const page = await listTransactions(db, listQuery({ month: '2026-03', accountId: savings }))
    expect(page.total).toBe(1)
    expect(page.rows).toHaveLength(1)
  })

  it('orders on the server, across pages', async () => {
    await addTransaction('expense', '2026-03-01', 9_000, current, groceries)
    await addTransaction('expense', '2026-03-02', 1_000, current, groceries)
    await addTransaction('expense', '2026-03-03', 5_000, current, groceries)

    const asc = await listTransactions(
      db,
      listQuery({ month: '2026-03', sort: 'amountCents', dir: 'asc' }),
    )
    expect(asc.rows.map((r) => r.amountCents)).toEqual([1_000, 5_000, 9_000])

    const firstPage = await listTransactions(
      db,
      listQuery({ month: '2026-03', sort: 'amountCents', dir: 'desc', limit: 1 }),
    )
    expect(firstPage.rows[0]?.amountCents).toBe(9_000)
  })
})

describe('soft deletes keep history readable', () => {
  it('still names a deleted account and category on their old rows', async () => {
    const old = await addAccount('Old Wallet', 7_000, true)
    const gym = await addCategory('Gym', 'expense', true)
    await addTransaction('expense', '2026-03-04', 3_500, old, gym)

    const { rows } = await listTransactions(db, listQuery({ month: '2026-03' }))
    expect(rows[0]?.accountName).toBe('Old Wallet')
    expect(rows[0]?.categoryName).toBe('Gym')
  })

  it('keeps a deleted category out of its own budget report', async () => {
    const gym = await addCategory('Gym', 'expense', true)
    await db
      .prepare('INSERT INTO budgets (id, categoryId, amountCents) VALUES (?, ?, ?)')
      .bind(newId(), gym, 10_000)
      .run()
    expect(await budgetStatus(db, '2026-03')).toHaveLength(0)
  })
})

describe('recurring postings', () => {
  async function addRule(startDate: string, endDate: string | null = null, amountCents = 120_000) {
    const id = newId()
    await db
      .prepare(
        `INSERT INTO recurringRules
           (id, kind, amountCents, accountId, categoryId, frequency, intervalCount,
            startDate, endDate, occurrenceIndex, nextRunOn, isActive)
         VALUES (?, 'income', ?, ?, ?, 'monthly', 1, ?, ?, 0, ?, 1)`,
      )
      .bind(id, amountCents, current, salary, startDate, endDate, startDate)
      .run()
    return id
  }

  it('catches up every occurrence missed while the app was closed', async () => {
    await addRule('2026-01-10')
    expect(await postDueRecurring(db, '2026-04-15')).toBe(4)

    const { results: posted } = await db
      .prepare('SELECT occurredOn FROM transactions ORDER BY occurredOn')
      .all<{ occurredOn: string }>()
    expect(posted.map((p) => p.occurredOn)).toEqual([
      '2026-01-10',
      '2026-02-10',
      '2026-03-10',
      '2026-04-10',
    ])
  })

  it('is idempotent across repeated runs', async () => {
    await addRule('2026-01-10')
    await postDueRecurring(db, '2026-04-15')
    const after = (await postDueRecurring(db, '2026-04-15')) + (await postDueRecurring(db, '2026-04-15'))

    expect(after).toBe(0)
    const count = await db.prepare('SELECT count(*) AS n FROM transactions').first<{ n: number }>()
    expect(count!.n).toBe(4)
  })

  it('deactivates a rule once it passes its end date', async () => {
    const id = await addRule('2026-01-10', '2026-03-01')
    await postDueRecurring(db, '2026-06-01')

    const rule = await db
      .prepare('SELECT isActive FROM recurringRules WHERE id = ?')
      .bind(id)
      .first<{ isActive: number }>()
    expect(rule!.isActive).toBe(0)
    const count = await db.prepare('SELECT count(*) AS n FROM transactions').first<{ n: number }>()
    expect(count!.n).toBe(2)
  })

  it('does not post a rule that has been soft-deleted', async () => {
    const id = await addRule('2026-01-10')
    await db
      .prepare('UPDATE recurringRules SET deletedAt = ?, isActive = 0 WHERE id = ?')
      .bind('2026-01-05 00:00:00', id)
      .run()
    expect(await postDueRecurring(db, '2026-06-01')).toBe(0)
  })

  it('keeps already-posted transactions when the series is deleted', async () => {
    const id = await addRule('2026-01-10')
    await postDueRecurring(db, '2026-03-15')
    await db
      .prepare('UPDATE recurringRules SET deletedAt = ?, isActive = 0 WHERE id = ?')
      .bind('2026-03-16 00:00:00', id)
      .run()
    await postDueRecurring(db, '2026-06-01')

    const count = await db.prepare('SELECT count(*) AS n FROM transactions').first<{ n: number }>()
    expect(count!.n).toBe(3)
  })
})

/*
 * Editing a series affects future occurrences only. The rule is enforced in the
 * PATCH route rather than in a helper, so the test drives the route.
 */
describe('editing a recurring series', () => {
  function patch(id: string, body: Record<string, unknown>) {
    return createApi().request(
      `/recurring/${id}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
      env,
    )
  }

  async function addRule(startDate: string) {
    const id = newId()
    await db
      .prepare(
        `INSERT INTO recurringRules
           (id, kind, amountCents, accountId, categoryId, frequency, intervalCount,
            startDate, endDate, occurrenceIndex, nextRunOn, isActive)
         VALUES (?, 'income', 120000, ?, ?, 'monthly', 1, ?, NULL, 0, ?, 1)`,
      )
      .bind(id, current, salary, startDate, startDate)
      .run()
    return id
  }

  it('leaves posted transactions alone and resumes at the first unposted date', async () => {
    const id = await addRule('2026-01-10')
    await postDueRecurring(db, '2026-03-15')

    const { results: before } = await db
      .prepare('SELECT occurredOn, amountCents FROM transactions ORDER BY occurredOn')
      .all()
    expect(before).toHaveLength(3)

    const response = await patch(id, { amountCents: 200_000, frequency: 'weekly' })
    expect(response.status).toBe(200)

    // Everything already posted keeps its old date and its old amount.
    const { results: after } = await db
      .prepare('SELECT occurredOn, amountCents FROM transactions ORDER BY occurredOn')
      .all()
    expect(after).toEqual(before)

    // The next run is the first weekly step past what has posted, not the
    // start date and not the old monthly cadence.
    const rule = await db
      .prepare('SELECT nextRunOn, occurrenceIndex FROM recurringRules WHERE id = ?')
      .bind(id)
      .first<{ nextRunOn: string; occurrenceIndex: number }>()
    expect(rule!.nextRunOn).toBe('2026-03-14')
    expect(rule!.occurrenceIndex).toBe(9)
  })

  it('posts the new amount from the next occurrence on', async () => {
    const id = await addRule('2026-01-10')
    await postDueRecurring(db, '2026-02-15')
    await patch(id, { amountCents: 200_000 })
    await postDueRecurring(db, '2026-04-15')

    const { results } = await db
      .prepare('SELECT amountCents FROM transactions ORDER BY occurredOn')
      .all()
    expect(results).toEqual([
      { amountCents: 120_000 },
      { amountCents: 120_000 },
      { amountCents: 200_000 },
      { amountCents: 200_000 },
    ])
  })

  it('does not reschedule when only the amount changes', async () => {
    const id = await addRule('2026-01-10')
    await postDueRecurring(db, '2026-02-15')
    const before = await db.prepare('SELECT nextRunOn FROM recurringRules WHERE id = ?').bind(id).first()

    await patch(id, { amountCents: 999 })

    expect(
      await db.prepare('SELECT nextRunOn FROM recurringRules WHERE id = ?').bind(id).first(),
    ).toEqual(before)
  })
})

describe('dashboard summary', () => {
  it('states net worth as of the selected month, not today', async () => {
    await addTransaction('income', '2026-03-10', 40_000, current, salary)
    await addTransaction('income', '2026-05-10', 500_000, current, salary)

    // Viewing March must not fold May's income into the headline figure.
    const march = await dashboardSummary(db, '2026-03', '2026-06-15')
    expect(march.netWorthCents).toBe(190_000)
    expect(march.previousNetWorthCents).toBe(150_000)
  })

  it('values the running month as of today rather than month end', async () => {
    await addTransaction('income', '2026-03-10', 40_000, current, salary)
    await addTransaction('income', '2026-03-28', 999_000, current, salary)

    const partial = await dashboardSummary(db, '2026-03', '2026-03-15')
    expect(partial.netWorthCents).toBe(190_000)
  })

  it('treats opening balances as the prior net worth', async () => {
    await addTransaction('income', '2026-03-10', 40_000, current, salary)
    expect((await dashboardSummary(db, '2026-03', '2026-03-31')).previousNetWorthCents).toBe(150_000)
  })

  it('has nothing to compare when there are no accounts', async () => {
    // Not a second database — D1 has one live binding per test file — just
    // clear every account this test doesn't want, same effect.
    await resetTables()
    expect((await dashboardSummary(db, '2026-03', '2026-03-31')).previousNetWorthCents).toBeNull()
  })

  it('counts only the selected month in the income and expense figures', async () => {
    await addTransaction('income', '2026-03-10', 40_000, current, salary)
    await addTransaction('expense', '2026-03-12', 5_000, current, groceries)
    await addTransaction('expense', '2026-04-02', 7_000, current, groceries)

    const march = await dashboardSummary(db, '2026-03', '2026-05-01')
    expect(march.monthIncomeCents).toBe(40_000)
    expect(march.monthExpenseCents).toBe(5_000)
    expect(march.monthBalanceCents).toBe(35_000)
  })
})

describe('net worth snapshots', () => {
  it('sums only live accounts', async () => {
    await addAccount('Old Wallet', 999_999, true)
    expect(await netWorthAsOf(db, '2026-03-01')).toBe(150_000)
  })

  it('values a date without counting later activity', async () => {
    await addTransaction('income', '2026-03-10', 40_000, current, salary)
    expect(await netWorthAsOf(db, '2026-03-09')).toBe(150_000)
    expect(await netWorthAsOf(db, '2026-03-10')).toBe(190_000)
  })

  it('nets transfers between live accounts to zero', async () => {
    await addTransfer('2026-03-05', 25_000, current, savings)
    expect(await netWorthAsOf(db, '2026-03-06')).toBe(150_000)
  })

  it('keys snapshots by month and updates rather than duplicating', async () => {
    await captureNetWorthSnapshot(db, '2026-03-04')
    await addTransaction('income', '2026-03-05', 40_000, current, salary)
    await captureNetWorthSnapshot(db, '2026-03-06')

    const { results: rows } = await db
      .prepare('SELECT capturedOn, amountCents FROM netWorthSnapshots')
      .all<{ capturedOn: string; amountCents: number }>()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.capturedOn).toBe('2026-03-01')
    expect(rows[0]?.amountCents).toBe(190_000)
  })

  it('backfills one snapshot per month from first activity', async () => {
    await addTransaction('income', '2026-01-15', 10_000, current, salary)
    const written = await backfillNetWorthSnapshots(db, '2026-04-20')

    const { results: rows } = await db
      .prepare('SELECT capturedOn FROM netWorthSnapshots ORDER BY capturedOn')
      .all<{ capturedOn: string }>()
    expect(written).toBe(4)
    expect(rows.map((r) => r.capturedOn)).toEqual([
      '2026-01-01',
      '2026-02-01',
      '2026-03-01',
      '2026-04-01',
    ])
  })
})
