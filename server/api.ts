import { Hono } from 'hono'
import type { Context } from 'hono'
import type { ZodType } from 'zod'
import {
  accountInputSchema,
  budgetInputSchema,
  categoryInputSchema,
  monthSchema,
  recurringRuleInputBaseSchema,
  recurringRuleInputSchema,
  transactionInputSchema,
  transactionQuerySchema,
  transferInputBaseSchema,
  transferInputSchema,
  transferQuerySchema,
  type CategoryKind,
  type Frequency,
} from '../shared/schemas.ts'
import { occurrenceDate } from '../shared/recurrence.ts'
import { newId, nowIso, today, type DB } from './db.ts'
import { runJobs } from './jobs.ts'
import {
  budgetStatus,
  dashboardSummary,
  getTransactionRow,
  getTransferRow,
  listAccountBalances,
  listTransactions,
  listTransfers,
  monthlyTotals,
  netWorthSeries,
  totalsByCategory,
} from './queries.ts'

class HttpError extends Error {
  readonly status: 400 | 404 | 409

  constructor(status: 400 | 404 | 409, message: string) {
    super(message)
    this.status = status
  }
}

async function body<T>(c: Context, schema: ZodType<T>): Promise<T> {
  const raw = await c.req.json().catch(() => {
    throw new HttpError(400, 'Expected a JSON body')
  })
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues.map((i) => i.message).join('; '))
  }
  return parsed.data
}

function query<T>(c: Context, schema: ZodType<T>): T {
  const parsed = schema.safeParse(c.req.query())
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues.map((i) => i.message).join('; '))
  }
  return parsed.data
}

function requireMonth(c: Context): string {
  const raw = c.req.query('month') ?? today().slice(0, 7)
  const parsed = monthSchema.safeParse(raw)
  if (!parsed.success) throw new HttpError(400, 'Expected month as YYYY-MM')
  return parsed.data
}

function found<T>(row: T | undefined, what: string): T {
  if (!row) throw new HttpError(404, `${what} not found`)
  return row
}

/** A transaction's category must be of the same kind as the transaction. */
function assertCategoryKind(db: DB, categoryId: string | null | undefined, kind: CategoryKind) {
  if (!categoryId) return
  const row = db
    .prepare('SELECT kind FROM categories WHERE id = ?')
    .get(categoryId) as { kind: CategoryKind } | undefined
  if (!row) throw new HttpError(400, 'Unknown category')
  if (row.kind !== kind) {
    throw new HttpError(400, `That category is an ${row.kind} category`)
  }
}

function assertAccountLive(db: DB, accountId: string) {
  const row = db
    .prepare('SELECT deletedAt FROM accounts WHERE id = ?')
    .get(accountId) as { deletedAt: string | null } | undefined
  if (!row) throw new HttpError(400, 'Unknown account')
  if (row.deletedAt) throw new HttpError(400, 'That account has been deleted')
}

export function createApi(db: DB) {
  const api = new Hono()

  api.onError((error, c) => {
    if (error instanceof HttpError) {
      return c.json({ error: error.message }, error.status)
    }
    console.error(error)
    return c.json({ error: 'Something went wrong on the server' }, 500)
  })

  /* ---------------------------------------------------------- accounts --- */

  api.get('/accounts', (c) =>
    c.json(listAccountBalances(db, c.req.query('includeDeleted') === 'true')),
  )

  api.post('/accounts', async (c) => {
    const input = await body(c, accountInputSchema)
    const id = newId()
    db.prepare(
      `INSERT INTO accounts (id, name, icon, initialBalanceCents, sortOrder)
       VALUES (@id, @name, @icon, @initialBalanceCents, @sortOrder)`,
    ).run({ id, ...input })
    return c.json(found(db.prepare('SELECT * FROM accountBalances WHERE id = ?').get(id), 'Account'), 201)
  })

  api.patch('/accounts/:id', async (c) => {
    const id = c.req.param('id')
    const input = await body(c, accountInputSchema.partial())
    found(db.prepare('SELECT id FROM accounts WHERE id = ?').get(id), 'Account')
    const fields = Object.keys(input) as (keyof typeof input)[]
    if (fields.length) {
      db.prepare(
        `UPDATE accounts SET ${fields.map((f) => `${f} = @${f}`).join(', ')} WHERE id = @id`,
      ).run({ id, ...input })
    }
    return c.json(db.prepare('SELECT * FROM accountBalances WHERE id = ?').get(id))
  })

  // Soft delete: history keeps rendering, the account leaves every picker.
  api.delete('/accounts/:id', (c) => {
    const id = c.req.param('id')
    found(db.prepare('SELECT id FROM accounts WHERE id = ?').get(id), 'Account')
    db.prepare('UPDATE accounts SET deletedAt = ? WHERE id = ?').run(nowIso(), id)
    db.prepare('UPDATE recurringRules SET isActive = 0 WHERE accountId = ?').run(id)
    return c.json({ ok: true })
  })

  api.post('/accounts/:id/restore', (c) => {
    const id = c.req.param('id')
    found(db.prepare('SELECT id FROM accounts WHERE id = ?').get(id), 'Account')
    db.prepare('UPDATE accounts SET deletedAt = NULL WHERE id = ?').run(id)
    return c.json({ ok: true })
  })

  /* -------------------------------------------------------- categories --- */

  api.get('/categories', (c) => {
    const kind = c.req.query('kind')
    const includeDeleted = c.req.query('includeDeleted') === 'true'
    const where: string[] = []
    if (!includeDeleted) where.push('deletedAt IS NULL')
    if (kind === 'expense' || kind === 'income') where.push(`kind = '${kind}'`)
    return c.json(
      db
        .prepare(
          `SELECT * FROM categories
           ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
           ORDER BY sortOrder, name`,
        )
        .all(),
    )
  })

  api.post('/categories', async (c) => {
    const input = await body(c, categoryInputSchema)
    const id = newId()
    db.prepare(
      `INSERT INTO categories (id, name, icon, kind, color, sortOrder)
       VALUES (@id, @name, @icon, @kind, @color, @sortOrder)`,
    ).run({ id, ...input, color: input.color ?? null })
    return c.json(db.prepare('SELECT * FROM categories WHERE id = ?').get(id), 201)
  })

  api.patch('/categories/:id', async (c) => {
    const id = c.req.param('id')
    const input = await body(c, categoryInputSchema.partial().omit({ kind: true }))
    found(db.prepare('SELECT id FROM categories WHERE id = ?').get(id), 'Category')
    const fields = Object.keys(input) as (keyof typeof input)[]
    if (fields.length) {
      db.prepare(
        `UPDATE categories SET ${fields.map((f) => `${f} = @${f}`).join(', ')} WHERE id = @id`,
      ).run({ id, ...input })
    }
    return c.json(db.prepare('SELECT * FROM categories WHERE id = ?').get(id))
  })

  api.delete('/categories/:id', (c) => {
    const id = c.req.param('id')
    found(db.prepare('SELECT id FROM categories WHERE id = ?').get(id), 'Category')
    db.prepare('UPDATE categories SET deletedAt = ? WHERE id = ?').run(nowIso(), id)
    db.prepare('DELETE FROM budgets WHERE categoryId = ?').run(id)
    db.prepare('UPDATE recurringRules SET isActive = 0 WHERE categoryId = ?').run(id)
    return c.json({ ok: true })
  })

  api.post('/categories/:id/restore', (c) => {
    const id = c.req.param('id')
    found(db.prepare('SELECT id FROM categories WHERE id = ?').get(id), 'Category')
    db.prepare('UPDATE categories SET deletedAt = NULL WHERE id = ?').run(id)
    return c.json({ ok: true })
  })

  /* ------------------------------------------------------ transactions --- */

  api.get('/transactions', (c) => c.json(listTransactions(db, query(c, transactionQuerySchema))))

  api.post('/transactions', async (c) => {
    const input = await body(c, transactionInputSchema)
    assertAccountLive(db, input.accountId)
    assertCategoryKind(db, input.categoryId, input.kind)
    const id = newId()
    db.prepare(
      `INSERT INTO transactions (id, kind, occurredOn, amountCents, accountId, categoryId, name, icon)
       VALUES (@id, @kind, @occurredOn, @amountCents, @accountId, @categoryId, @name, @icon)`,
    ).run({
      id,
      ...input,
      categoryId: input.categoryId ?? null,
      name: input.name ?? null,
      icon: input.icon ?? null,
    })
    return c.json(getTransactionRow(db, id), 201)
  })

  api.patch('/transactions/:id', async (c) => {
    const id = c.req.param('id')
    const existing = found(
      db.prepare('SELECT * FROM transactions WHERE id = ?').get(id) as
        | { kind: CategoryKind }
        | undefined,
      'Transaction',
    )
    const input = await body(c, transactionInputSchema.partial())
    if (input.accountId) assertAccountLive(db, input.accountId)
    assertCategoryKind(db, input.categoryId, input.kind ?? existing.kind)
    const fields = Object.keys(input) as (keyof typeof input)[]
    if (fields.length) {
      db.prepare(
        `UPDATE transactions SET ${fields.map((f) => `${f} = @${f}`).join(', ')} WHERE id = @id`,
      ).run({ id, ...input })
    }
    return c.json(getTransactionRow(db, id))
  })

  api.delete('/transactions/:id', (c) => {
    const id = c.req.param('id')
    const result = db.prepare('DELETE FROM transactions WHERE id = ?').run(id)
    if (!result.changes) throw new HttpError(404, 'Transaction not found')
    return c.json({ ok: true })
  })

  /* ---------------------------------------------------------- transfers -- */

  api.get('/transfers', (c) => c.json(listTransfers(db, query(c, transferQuerySchema))))

  api.post('/transfers', async (c) => {
    const input = await body(c, transferInputSchema)
    assertAccountLive(db, input.fromAccountId)
    assertAccountLive(db, input.toAccountId)
    const id = newId()
    db.prepare(
      `INSERT INTO transfers (id, occurredOn, amountCents, fromAccountId, toAccountId, note)
       VALUES (@id, @occurredOn, @amountCents, @fromAccountId, @toAccountId, @note)`,
    ).run({ id, ...input, note: input.note ?? null })
    return c.json(getTransferRow(db, id), 201)
  })

  api.patch('/transfers/:id', async (c) => {
    const id = c.req.param('id')
    found(db.prepare('SELECT id FROM transfers WHERE id = ?').get(id), 'Transfer')
    const input = await body(c, transferInputBaseSchema.partial())
    const fields = Object.keys(input)
    if (fields.includes('fromAccountId') && fields.includes('toAccountId')) {
      if (input.fromAccountId === input.toAccountId) {
        throw new HttpError(400, 'Pick two different accounts')
      }
    }
    if (fields.length) {
      db.prepare(
        `UPDATE transfers SET ${fields.map((f) => `${f} = @${f}`).join(', ')} WHERE id = @id`,
      ).run({ id, ...input })
    }
    return c.json(getTransferRow(db, id))
  })

  api.delete('/transfers/:id', (c) => {
    const id = c.req.param('id')
    const result = db.prepare('DELETE FROM transfers WHERE id = ?').run(id)
    if (!result.changes) throw new HttpError(404, 'Transfer not found')
    return c.json({ ok: true })
  })

  /* ----------------------------------------------------------- budgets --- */

  api.get('/budgets', (c) => c.json(budgetStatus(db, requireMonth(c))))

  api.put('/budgets', async (c) => {
    const input = await body(c, budgetInputSchema)
    db.prepare(
      `INSERT INTO budgets (id, categoryId, amountCents)
       VALUES (@id, @categoryId, @amountCents)
       ON CONFLICT (categoryId) DO UPDATE
         SET amountCents = excluded.amountCents, updatedAt = datetime('now')`,
    ).run({ id: newId(), ...input })
    return c.json({ ok: true })
  })

  api.delete('/budgets/:categoryId', (c) => {
    db.prepare('DELETE FROM budgets WHERE categoryId = ?').run(c.req.param('categoryId'))
    return c.json({ ok: true })
  })

  /* --------------------------------------------------------- recurring --- */

  api.get('/recurring', (c) =>
    c.json(
      db
        .prepare(
          `SELECT r.*,
                  a.name AS accountName, a.icon AS accountIcon,
                  c.name AS categoryName, c.icon AS categoryIcon
           FROM recurringRules r
           JOIN accounts a ON a.id = r.accountId
           LEFT JOIN categories c ON c.id = r.categoryId
           WHERE r.deletedAt IS NULL
           ORDER BY r.isActive DESC, r.nextRunOn`,
        )
        .all(),
    ),
  )

  api.post('/recurring', async (c) => {
    const input = await body(c, recurringRuleInputSchema)
    assertAccountLive(db, input.accountId)
    assertCategoryKind(db, input.categoryId, input.kind)
    const id = newId()
    db.prepare(
      `INSERT INTO recurringRules
         (id, kind, amountCents, accountId, categoryId, name, frequency,
          intervalCount, startDate, endDate, occurrenceIndex, nextRunOn, isActive)
       VALUES (@id, @kind, @amountCents, @accountId, @categoryId, @name, @frequency,
               @intervalCount, @startDate, @endDate, 0, @nextRunOn, @isActive)`,
    ).run({
      id,
      ...input,
      categoryId: input.categoryId ?? null,
      name: input.name ?? null,
      endDate: input.endDate ?? null,
      nextRunOn: input.startDate,
      isActive: input.isActive === false ? 0 : 1,
    })
    return c.json(db.prepare('SELECT * FROM recurringRules WHERE id = ?').get(id), 201)
  })

  /*
   * Editing a series only ever affects future occurrences: already-posted
   * transactions are never rewritten. Changing the schedule re-anchors
   * `occurrenceIndex` to the first occurrence that has not yet been posted.
   */
  api.patch('/recurring/:id', async (c) => {
    const id = c.req.param('id')
    const existing = found(
      db.prepare('SELECT * FROM recurringRules WHERE id = ?').get(id) as
        | {
            kind: CategoryKind
            startDate: string
            frequency: Frequency
            intervalCount: number
            lastPostedOn: string | null
            occurrenceIndex: number
          }
        | undefined,
      'Recurring rule',
    )
    const input = await body(c, recurringRuleInputBaseSchema.partial())
    if (input.accountId) assertAccountLive(db, input.accountId)
    assertCategoryKind(db, input.categoryId, input.kind ?? existing.kind)

    const patch: Record<string, unknown> = { ...input }
    if (input.isActive !== undefined) patch.isActive = input.isActive ? 1 : 0

    const reschedules =
      input.startDate !== undefined ||
      input.frequency !== undefined ||
      input.intervalCount !== undefined

    if (reschedules) {
      const startDate = input.startDate ?? existing.startDate
      const frequency = input.frequency ?? existing.frequency
      const intervalCount = input.intervalCount ?? existing.intervalCount
      const after = existing.lastPostedOn
      let index = 0
      while (index < 2000) {
        const date = occurrenceDate(startDate, frequency, intervalCount, index)
        if (!after || date > after) break
        index += 1
      }
      patch.occurrenceIndex = index
      patch.nextRunOn = occurrenceDate(startDate, frequency, intervalCount, index)
    }

    const fields = Object.keys(patch)
    if (fields.length) {
      db.prepare(
        `UPDATE recurringRules SET ${fields.map((f) => `${f} = @${f}`).join(', ')} WHERE id = @id`,
      ).run({ id, ...patch })
    }
    return c.json(db.prepare('SELECT * FROM recurringRules WHERE id = ?').get(id))
  })

  // Stops future postings; everything already posted stays in history.
  api.delete('/recurring/:id', (c) => {
    const id = c.req.param('id')
    found(db.prepare('SELECT id FROM recurringRules WHERE id = ?').get(id), 'Recurring rule')
    db.prepare('UPDATE recurringRules SET deletedAt = ?, isActive = 0 WHERE id = ?').run(
      nowIso(),
      id,
    )
    return c.json({ ok: true })
  })

  /* --------------------------------------------------------- analytics --- */

  api.get('/analytics/summary', (c) => c.json(dashboardSummary(db, requireMonth(c), today())))
  api.get('/analytics/net-worth', (c) => c.json(netWorthSeries(db)))

  api.get('/analytics/monthly', (c) => {
    const months = Math.min(Math.max(Number(c.req.query('months') ?? 12), 1), 60)
    return c.json(monthlyTotals(db, months, requireMonth(c)))
  })

  api.get('/analytics/by-category', (c) => {
    const kind = c.req.query('kind') === 'income' ? 'income' : 'expense'
    return c.json(totalsByCategory(db, requireMonth(c), kind))
  })

  api.get('/analytics/budget-status', (c) => c.json(budgetStatus(db, requireMonth(c))))

  /* -------------------------------------------------------------- jobs --- */

  api.post('/jobs/run', (c) => c.json(runJobs(db)))

  api.get('/health', (c) => c.json({ ok: true, today: today() }))

  return api
}
