import { beforeEach, describe, expect, it } from 'vitest'
import { createApi } from '../server/api.ts'
import { newId, openDatabase, type DB } from '../server/db.ts'
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

let db: DB
let current: string
let savings: string
let groceries: string
let salary: string

function addAccount(name: string, initialBalanceCents: number, deleted = false) {
  const id = newId()
  db.prepare(
    `INSERT INTO accounts (id, name, icon, initialBalanceCents, deletedAt)
     VALUES (?, ?, 'wallet', ?, ?)`,
  ).run(id, name, initialBalanceCents, deleted ? '2026-01-01 00:00:00' : null)
  return id
}

function addCategory(name: string, kind: 'expense' | 'income', deleted = false) {
  const id = newId()
  db.prepare(
    `INSERT INTO categories (id, name, icon, kind, deletedAt) VALUES (?, ?, 'tag', ?, ?)`,
  ).run(id, name, kind, deleted ? '2026-01-01 00:00:00' : null)
  return id
}

function addTransaction(
  kind: 'expense' | 'income',
  occurredOn: string,
  amountCents: number,
  accountId: string,
  categoryId: string | null,
) {
  const id = newId()
  db.prepare(
    `INSERT INTO transactions (id, kind, occurredOn, amountCents, accountId, categoryId)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, kind, occurredOn, amountCents, accountId, categoryId)
  return id
}

function addTransfer(occurredOn: string, amountCents: number, from: string, to: string) {
  db.prepare(
    `INSERT INTO transfers (id, occurredOn, amountCents, fromAccountId, toAccountId)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(newId(), occurredOn, amountCents, from, to)
}

beforeEach(() => {
  db = openDatabase(':memory:')
  current = addAccount('Current', 100_000)
  savings = addAccount('Savings', 50_000)
  groceries = addCategory('Groceries', 'expense')
  salary = addCategory('Salary', 'income')
})

describe('account balances', () => {
  it('applies income, expense and both sides of a transfer', () => {
    addTransaction('income', '2026-03-01', 200_000, current, salary)
    addTransaction('expense', '2026-03-02', 30_000, current, groceries)
    addTransfer('2026-03-03', 25_000, current, savings)

    const balances = listAccountBalances(db)
    const byName = new Map(balances.map((b) => [b.name, b.balanceCents]))

    expect(byName.get('Current')).toBe(100_000 + 200_000 - 30_000 - 25_000)
    expect(byName.get('Savings')).toBe(50_000 + 25_000)
  })

  it('hides soft-deleted accounts from the live list but keeps them retrievable', () => {
    addAccount('Old Wallet', 7_000, true)
    expect(listAccountBalances(db).map((a) => a.name)).not.toContain('Old Wallet')
    expect(listAccountBalances(db, true).map((a) => a.name)).toContain('Old Wallet')
  })
})

describe('analytics exclude transfers', () => {
  it('leaves transfer volume out of monthly income and expense', () => {
    addTransaction('income', '2026-03-01', 200_000, current, salary)
    addTransaction('expense', '2026-03-02', 30_000, current, groceries)
    addTransfer('2026-03-03', 90_000, current, savings)

    const [march] = monthlyTotals(db, 1, '2026-03')
    expect(march?.incomeCents).toBe(200_000)
    expect(march?.expenseCents).toBe(30_000)
    expect(march?.balanceCents).toBe(170_000)
  })

  it('leaves transfers out of the category breakdown', () => {
    addTransaction('expense', '2026-03-02', 30_000, current, groceries)
    addTransfer('2026-03-03', 90_000, current, savings)

    const totals = totalsByCategory(db, '2026-03', 'expense')
    expect(totals).toHaveLength(1)
    expect(totals[0]?.totalCents).toBe(30_000)
  })

  it('leaves transfers out of budget spend', () => {
    db.prepare('INSERT INTO budgets (id, categoryId, amountCents) VALUES (?, ?, ?)').run(
      newId(),
      groceries,
      50_000,
    )
    addTransaction('expense', '2026-03-02', 30_000, current, groceries)
    addTransfer('2026-03-03', 90_000, current, savings)

    const [status] = budgetStatus(db, '2026-03')
    expect(status?.spentCents).toBe(30_000)
    expect(status?.budgetCents).toBe(50_000)
  })

  it('zero-fills months with no activity', () => {
    addTransaction('expense', '2026-03-02', 30_000, current, groceries)
    const series = monthlyTotals(db, 3, '2026-03')
    expect(series.map((s) => s.month)).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(series[0]).toMatchObject({ incomeCents: 0, expenseCents: 0, balanceCents: 0 })
  })
})

describe('soft deletes keep history readable', () => {
  it('still names a deleted account and category on their old rows', () => {
    const old = addAccount('Old Wallet', 7_000, true)
    const gym = addCategory('Gym', 'expense', true)
    addTransaction('expense', '2026-03-04', 3_500, old, gym)

    const [row] = listTransactions(db, { month: '2026-03', limit: 100 })
    expect(row?.accountName).toBe('Old Wallet')
    expect(row?.categoryName).toBe('Gym')
  })

  it('keeps a deleted category out of its own budget report', () => {
    const gym = addCategory('Gym', 'expense', true)
    db.prepare('INSERT INTO budgets (id, categoryId, amountCents) VALUES (?, ?, ?)').run(
      newId(),
      gym,
      10_000,
    )
    expect(budgetStatus(db, '2026-03')).toHaveLength(0)
  })
})

describe('recurring postings', () => {
  function addRule(startDate: string, endDate: string | null = null, amountCents = 120_000) {
    const id = newId()
    db.prepare(
      `INSERT INTO recurringRules
         (id, kind, amountCents, accountId, categoryId, frequency, intervalCount,
          startDate, endDate, occurrenceIndex, nextRunOn, isActive)
       VALUES (?, 'income', ?, ?, ?, 'monthly', 1, ?, ?, 0, ?, 1)`,
    ).run(id, amountCents, current, salary, startDate, endDate, startDate)
    return id
  }

  it('catches up every occurrence missed while the app was closed', () => {
    addRule('2026-01-10')
    expect(postDueRecurring(db, '2026-04-15')).toBe(4)

    const posted = db
      .prepare('SELECT occurredOn FROM transactions ORDER BY occurredOn')
      .all() as { occurredOn: string }[]
    expect(posted.map((p) => p.occurredOn)).toEqual([
      '2026-01-10',
      '2026-02-10',
      '2026-03-10',
      '2026-04-10',
    ])
  })

  it('is idempotent across repeated runs', () => {
    addRule('2026-01-10')
    postDueRecurring(db, '2026-04-15')
    const after = postDueRecurring(db, '2026-04-15') + postDueRecurring(db, '2026-04-15')

    expect(after).toBe(0)
    expect(
      (db.prepare('SELECT count(*) AS n FROM transactions').get() as { n: number }).n,
    ).toBe(4)
  })

  it('deactivates a rule once it passes its end date', () => {
    const id = addRule('2026-01-10', '2026-03-01')
    postDueRecurring(db, '2026-06-01')

    const rule = db.prepare('SELECT isActive FROM recurringRules WHERE id = ?').get(id) as {
      isActive: number
    }
    expect(rule.isActive).toBe(0)
    expect(
      (db.prepare('SELECT count(*) AS n FROM transactions').get() as { n: number }).n,
    ).toBe(2)
  })

  it('does not post a rule that has been soft-deleted', () => {
    const id = addRule('2026-01-10')
    db.prepare('UPDATE recurringRules SET deletedAt = ?, isActive = 0 WHERE id = ?').run(
      '2026-01-05 00:00:00',
      id,
    )
    expect(postDueRecurring(db, '2026-06-01')).toBe(0)
  })

  it('keeps already-posted transactions when the series is deleted', () => {
    const id = addRule('2026-01-10')
    postDueRecurring(db, '2026-03-15')
    db.prepare('UPDATE recurringRules SET deletedAt = ?, isActive = 0 WHERE id = ?').run(
      '2026-03-16 00:00:00',
      id,
    )
    postDueRecurring(db, '2026-06-01')

    expect(
      (db.prepare('SELECT count(*) AS n FROM transactions').get() as { n: number }).n,
    ).toBe(3)
  })
})

/*
 * Editing a series affects future occurrences only. The rule is enforced in the
 * PATCH route rather than in a helper, so the test drives the route.
 */
describe('editing a recurring series', () => {
  function patch(id: string, body: Record<string, unknown>) {
    return createApi(db).request(`/recurring/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  function addRule(startDate: string) {
    const id = newId()
    db.prepare(
      `INSERT INTO recurringRules
         (id, kind, amountCents, accountId, categoryId, frequency, intervalCount,
          startDate, endDate, occurrenceIndex, nextRunOn, isActive)
       VALUES (?, 'income', 120000, ?, ?, 'monthly', 1, ?, NULL, 0, ?, 1)`,
    ).run(id, current, salary, startDate, startDate)
    return id
  }

  it('leaves posted transactions alone and resumes at the first unposted date', async () => {
    const id = addRule('2026-01-10')
    postDueRecurring(db, '2026-03-15')

    const before = db
      .prepare('SELECT occurredOn, amountCents FROM transactions ORDER BY occurredOn')
      .all()
    expect(before).toHaveLength(3)

    const response = await patch(id, { amountCents: 200_000, frequency: 'weekly' })
    expect(response.status).toBe(200)

    // Everything already posted keeps its old date and its old amount.
    expect(
      db.prepare('SELECT occurredOn, amountCents FROM transactions ORDER BY occurredOn').all(),
    ).toEqual(before)

    // The next run is the first weekly step past what has posted, not the
    // start date and not the old monthly cadence.
    const rule = db.prepare('SELECT nextRunOn, occurrenceIndex FROM recurringRules WHERE id = ?')
      .get(id) as { nextRunOn: string; occurrenceIndex: number }
    expect(rule.nextRunOn).toBe('2026-03-14')
    expect(rule.occurrenceIndex).toBe(9)
  })

  it('posts the new amount from the next occurrence on', async () => {
    const id = addRule('2026-01-10')
    postDueRecurring(db, '2026-02-15')
    await patch(id, { amountCents: 200_000 })
    postDueRecurring(db, '2026-04-15')

    expect(
      db.prepare('SELECT amountCents FROM transactions ORDER BY occurredOn').all(),
    ).toEqual([
      { amountCents: 120_000 },
      { amountCents: 120_000 },
      { amountCents: 200_000 },
      { amountCents: 200_000 },
    ])
  })

  it('does not reschedule when only the amount changes', async () => {
    const id = addRule('2026-01-10')
    postDueRecurring(db, '2026-02-15')
    const before = db.prepare('SELECT nextRunOn FROM recurringRules WHERE id = ?').get(id)

    await patch(id, { amountCents: 999 })

    expect(db.prepare('SELECT nextRunOn FROM recurringRules WHERE id = ?').get(id)).toEqual(before)
  })
})

describe('dashboard summary', () => {
  it('states net worth as of the selected month, not today', () => {
    addTransaction('income', '2026-03-10', 40_000, current, salary)
    addTransaction('income', '2026-05-10', 500_000, current, salary)

    // Viewing March must not fold May's income into the headline figure.
    const march = dashboardSummary(db, '2026-03', '2026-06-15')
    expect(march.netWorthCents).toBe(190_000)
    expect(march.previousNetWorthCents).toBe(150_000)
  })

  it('values the running month as of today rather than month end', () => {
    addTransaction('income', '2026-03-10', 40_000, current, salary)
    addTransaction('income', '2026-03-28', 999_000, current, salary)

    const partial = dashboardSummary(db, '2026-03', '2026-03-15')
    expect(partial.netWorthCents).toBe(190_000)
  })

  it('treats opening balances as the prior net worth', () => {
    addTransaction('income', '2026-03-10', 40_000, current, salary)
    expect(dashboardSummary(db, '2026-03', '2026-03-31').previousNetWorthCents).toBe(150_000)
  })

  it('has nothing to compare when there are no accounts', () => {
    const empty = openDatabase(':memory:')
    expect(dashboardSummary(empty, '2026-03', '2026-03-31').previousNetWorthCents).toBeNull()
    empty.close()
  })

  it('counts only the selected month in the income and expense figures', () => {
    addTransaction('income', '2026-03-10', 40_000, current, salary)
    addTransaction('expense', '2026-03-12', 5_000, current, groceries)
    addTransaction('expense', '2026-04-02', 7_000, current, groceries)

    const march = dashboardSummary(db, '2026-03', '2026-05-01')
    expect(march.monthIncomeCents).toBe(40_000)
    expect(march.monthExpenseCents).toBe(5_000)
    expect(march.monthBalanceCents).toBe(35_000)
  })
})

describe('net worth snapshots', () => {
  it('sums only live accounts', () => {
    addAccount('Old Wallet', 999_999, true)
    expect(netWorthAsOf(db, '2026-03-01')).toBe(150_000)
  })

  it('values a date without counting later activity', () => {
    addTransaction('income', '2026-03-10', 40_000, current, salary)
    expect(netWorthAsOf(db, '2026-03-09')).toBe(150_000)
    expect(netWorthAsOf(db, '2026-03-10')).toBe(190_000)
  })

  it('nets transfers between live accounts to zero', () => {
    addTransfer('2026-03-05', 25_000, current, savings)
    expect(netWorthAsOf(db, '2026-03-06')).toBe(150_000)
  })

  it('keys snapshots by month and updates rather than duplicating', () => {
    captureNetWorthSnapshot(db, '2026-03-04')
    addTransaction('income', '2026-03-05', 40_000, current, salary)
    captureNetWorthSnapshot(db, '2026-03-06')

    const rows = db
      .prepare('SELECT capturedOn, amountCents FROM netWorthSnapshots')
      .all() as { capturedOn: string; amountCents: number }[]
    expect(rows).toHaveLength(1)
    expect(rows[0]?.capturedOn).toBe('2026-03-01')
    expect(rows[0]?.amountCents).toBe(190_000)
  })

  it('backfills one snapshot per month from first activity', () => {
    addTransaction('income', '2026-01-15', 10_000, current, salary)
    const written = backfillNetWorthSnapshots(db, '2026-04-20')

    const rows = db
      .prepare('SELECT capturedOn FROM netWorthSnapshots ORDER BY capturedOn')
      .all() as { capturedOn: string }[]
    expect(written).toBe(4)
    expect(rows.map((r) => r.capturedOn)).toEqual([
      '2026-01-01',
      '2026-02-01',
      '2026-03-01',
      '2026-04-01',
    ])
  })
})
