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

function found<T>(row: T | null | undefined, what: string): T {
  if (!row) throw new HttpError(404, `${what} not found`)
  return row
}

/** Builds `field = ?, field = ?` for a dynamic PATCH plus the matching
 *  positional values, `id` last — D1 has no named-parameter binding. */
function setClause<T extends Record<string, unknown>>(
  patch: T,
): { sql: string; values: unknown[] } {
  const fields = Object.keys(patch)
  return {
    sql: fields.map((f) => `${f} = ?`).join(', '),
    values: fields.map((f) => patch[f]),
  }
}

/** A transaction's category must be of the same kind as the transaction. */
async function assertCategoryKind(db: DB, categoryId: string | null | undefined, kind: CategoryKind) {
  if (!categoryId) return
  const row = await db
    .prepare('SELECT kind FROM categories WHERE id = ?')
    .bind(categoryId)
    .first<{ kind: CategoryKind }>()
  if (!row) throw new HttpError(400, 'Unknown category')
  if (row.kind !== kind) {
    throw new HttpError(400, `That category is an ${row.kind} category`)
  }
}

async function assertAccountLive(db: DB, accountId: string) {
  const row = await db
    .prepare('SELECT deletedAt FROM accounts WHERE id = ?')
    .bind(accountId)
    .first<{ deletedAt: string | null }>()
  if (!row) throw new HttpError(400, 'Unknown account')
  if (row.deletedAt) throw new HttpError(400, 'That account has been deleted')
}

export function createApi() {
  const api = new Hono<{ Bindings: Env }>()

  api.onError((error, c) => {
    if (error instanceof HttpError) {
      return c.json({ error: error.message }, error.status)
    }
    console.error(error)
    return c.json({ error: 'Something went wrong on the server' }, 500)
  })

  /* ---------------------------------------------------------- accounts --- */

  api.get('/accounts', async (c) =>
    c.json(await listAccountBalances(c.env.DB, c.req.query('includeDeleted') === 'true')),
  )

  api.post('/accounts', async (c) => {
    const db = c.env.DB
    const input = await body(c, accountInputSchema)
    const id = newId()
    await db
      .prepare(
        `INSERT INTO accounts (id, name, icon, initialBalanceCents, sortOrder)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(id, input.name, input.icon, input.initialBalanceCents, input.sortOrder)
      .run()
    return c.json(
      found(await db.prepare('SELECT * FROM accountBalances WHERE id = ?').bind(id).first(), 'Account'),
      201,
    )
  })

  api.patch('/accounts/:id', async (c) => {
    const db = c.env.DB
    const id = c.req.param('id')
    const input = await body(c, accountInputSchema.partial())
    found(await db.prepare('SELECT id FROM accounts WHERE id = ?').bind(id).first(), 'Account')
    const { sql, values } = setClause(input)
    if (values.length) {
      await db.prepare(`UPDATE accounts SET ${sql} WHERE id = ?`).bind(...values, id).run()
    }
    return c.json(await db.prepare('SELECT * FROM accountBalances WHERE id = ?').bind(id).first())
  })

  // Soft delete: history keeps rendering, the account leaves every picker.
  api.delete('/accounts/:id', async (c) => {
    const db = c.env.DB
    const id = c.req.param('id')
    found(await db.prepare('SELECT id FROM accounts WHERE id = ?').bind(id).first(), 'Account')
    await db.prepare('UPDATE accounts SET deletedAt = ? WHERE id = ?').bind(nowIso(), id).run()
    await db.prepare('UPDATE recurringRules SET isActive = 0 WHERE accountId = ?').bind(id).run()
    return c.json({ ok: true })
  })

  api.post('/accounts/:id/restore', async (c) => {
    const db = c.env.DB
    const id = c.req.param('id')
    found(await db.prepare('SELECT id FROM accounts WHERE id = ?').bind(id).first(), 'Account')
    await db.prepare('UPDATE accounts SET deletedAt = NULL WHERE id = ?').bind(id).run()
    return c.json({ ok: true })
  })

  /* -------------------------------------------------------- categories --- */

  api.get('/categories', async (c) => {
    const db = c.env.DB
    const kind = c.req.query('kind')
    const includeDeleted = c.req.query('includeDeleted') === 'true'
    const where: string[] = []
    const params: unknown[] = []
    if (!includeDeleted) where.push('deletedAt IS NULL')
    if (kind === 'expense' || kind === 'income') {
      where.push('kind = ?')
      params.push(kind)
    }
    const { results } = await db
      .prepare(
        `SELECT * FROM categories
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY sortOrder, name`,
      )
      .bind(...params)
      .all()
    return c.json(results)
  })

  api.post('/categories', async (c) => {
    const db = c.env.DB
    const input = await body(c, categoryInputSchema)
    const id = newId()
    await db
      .prepare(
        `INSERT INTO categories (id, name, icon, kind, color, sortOrder)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, input.name, input.icon, input.kind, input.color ?? null, input.sortOrder)
      .run()
    return c.json(await db.prepare('SELECT * FROM categories WHERE id = ?').bind(id).first(), 201)
  })

  api.patch('/categories/:id', async (c) => {
    const db = c.env.DB
    const id = c.req.param('id')
    const input = await body(c, categoryInputSchema.partial().omit({ kind: true }))
    found(await db.prepare('SELECT id FROM categories WHERE id = ?').bind(id).first(), 'Category')
    const { sql, values } = setClause(input)
    if (values.length) {
      await db.prepare(`UPDATE categories SET ${sql} WHERE id = ?`).bind(...values, id).run()
    }
    return c.json(await db.prepare('SELECT * FROM categories WHERE id = ?').bind(id).first())
  })

  api.delete('/categories/:id', async (c) => {
    const db = c.env.DB
    const id = c.req.param('id')
    found(await db.prepare('SELECT id FROM categories WHERE id = ?').bind(id).first(), 'Category')
    await db.prepare('UPDATE categories SET deletedAt = ? WHERE id = ?').bind(nowIso(), id).run()
    await db.prepare('DELETE FROM budgets WHERE categoryId = ?').bind(id).run()
    await db.prepare('UPDATE recurringRules SET isActive = 0 WHERE categoryId = ?').bind(id).run()
    return c.json({ ok: true })
  })

  api.post('/categories/:id/restore', async (c) => {
    const db = c.env.DB
    const id = c.req.param('id')
    found(await db.prepare('SELECT id FROM categories WHERE id = ?').bind(id).first(), 'Category')
    await db.prepare('UPDATE categories SET deletedAt = NULL WHERE id = ?').bind(id).run()
    return c.json({ ok: true })
  })

  /* ------------------------------------------------------ transactions --- */

  api.get('/transactions', async (c) =>
    c.json(await listTransactions(c.env.DB, query(c, transactionQuerySchema))),
  )

  api.post('/transactions', async (c) => {
    const db = c.env.DB
    const input = await body(c, transactionInputSchema)
    await assertAccountLive(db, input.accountId)
    await assertCategoryKind(db, input.categoryId, input.kind)
    const id = newId()
    await db
      .prepare(
        `INSERT INTO transactions (id, kind, occurredOn, amountCents, accountId, categoryId, name, icon)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        input.kind,
        input.occurredOn,
        input.amountCents,
        input.accountId,
        input.categoryId ?? null,
        input.name ?? null,
        input.icon ?? null,
      )
      .run()
    return c.json(await getTransactionRow(db, id), 201)
  })

  api.patch('/transactions/:id', async (c) => {
    const db = c.env.DB
    const id = c.req.param('id')
    const existing = found(
      await db.prepare('SELECT * FROM transactions WHERE id = ?').bind(id).first<{ kind: CategoryKind }>(),
      'Transaction',
    )
    const input = await body(c, transactionInputSchema.partial())
    if (input.accountId) await assertAccountLive(db, input.accountId)
    await assertCategoryKind(db, input.categoryId, input.kind ?? existing.kind)
    const { sql, values } = setClause(input)
    if (values.length) {
      await db.prepare(`UPDATE transactions SET ${sql} WHERE id = ?`).bind(...values, id).run()
    }
    return c.json(await getTransactionRow(db, id))
  })

  api.delete('/transactions/:id', async (c) => {
    const db = c.env.DB
    const id = c.req.param('id')
    const result = await db.prepare('DELETE FROM transactions WHERE id = ?').bind(id).run()
    if (!result.meta.changes) throw new HttpError(404, 'Transaction not found')
    return c.json({ ok: true })
  })

  /* ---------------------------------------------------------- transfers -- */

  api.get('/transfers', async (c) =>
    c.json(await listTransfers(c.env.DB, query(c, transferQuerySchema))),
  )

  api.post('/transfers', async (c) => {
    const db = c.env.DB
    const input = await body(c, transferInputSchema)
    await assertAccountLive(db, input.fromAccountId)
    await assertAccountLive(db, input.toAccountId)
    const id = newId()
    await db
      .prepare(
        `INSERT INTO transfers (id, occurredOn, amountCents, fromAccountId, toAccountId, note)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, input.occurredOn, input.amountCents, input.fromAccountId, input.toAccountId, input.note ?? null)
      .run()
    return c.json(await getTransferRow(db, id), 201)
  })

  api.patch('/transfers/:id', async (c) => {
    const db = c.env.DB
    const id = c.req.param('id')
    found(await db.prepare('SELECT id FROM transfers WHERE id = ?').bind(id).first(), 'Transfer')
    const input = await body(c, transferInputBaseSchema.partial())
    if (input.fromAccountId !== undefined && input.toAccountId !== undefined) {
      if (input.fromAccountId === input.toAccountId) {
        throw new HttpError(400, 'Pick two different accounts')
      }
    }
    const { sql, values } = setClause(input)
    if (values.length) {
      await db.prepare(`UPDATE transfers SET ${sql} WHERE id = ?`).bind(...values, id).run()
    }
    return c.json(await getTransferRow(db, id))
  })

  api.delete('/transfers/:id', async (c) => {
    const db = c.env.DB
    const id = c.req.param('id')
    const result = await db.prepare('DELETE FROM transfers WHERE id = ?').bind(id).run()
    if (!result.meta.changes) throw new HttpError(404, 'Transfer not found')
    return c.json({ ok: true })
  })

  /* ----------------------------------------------------------- budgets --- */

  api.get('/budgets', async (c) => c.json(await budgetStatus(c.env.DB, requireMonth(c))))

  api.put('/budgets', async (c) => {
    const db = c.env.DB
    const input = await body(c, budgetInputSchema)
    await db
      .prepare(
        `INSERT INTO budgets (id, categoryId, amountCents)
         VALUES (?, ?, ?)
         ON CONFLICT (categoryId) DO UPDATE
           SET amountCents = excluded.amountCents, updatedAt = datetime('now')`,
      )
      .bind(newId(), input.categoryId, input.amountCents)
      .run()
    return c.json({ ok: true })
  })

  api.delete('/budgets/:categoryId', async (c) => {
    await c.env.DB.prepare('DELETE FROM budgets WHERE categoryId = ?').bind(c.req.param('categoryId')).run()
    return c.json({ ok: true })
  })

  /* --------------------------------------------------------- recurring --- */

  api.get('/recurring', async (c) => {
    const { results } = await c.env.DB
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
      .all()
    return c.json(results)
  })

  api.post('/recurring', async (c) => {
    const db = c.env.DB
    const input = await body(c, recurringRuleInputSchema)
    await assertAccountLive(db, input.accountId)
    await assertCategoryKind(db, input.categoryId, input.kind)
    const id = newId()
    await db
      .prepare(
        `INSERT INTO recurringRules
           (id, kind, amountCents, accountId, categoryId, name, frequency,
            intervalCount, startDate, endDate, occurrenceIndex, nextRunOn, isActive)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      )
      .bind(
        id,
        input.kind,
        input.amountCents,
        input.accountId,
        input.categoryId ?? null,
        input.name ?? null,
        input.frequency,
        input.intervalCount,
        input.startDate,
        input.endDate ?? null,
        input.startDate,
        input.isActive === false ? 0 : 1,
      )
      .run()
    return c.json(await db.prepare('SELECT * FROM recurringRules WHERE id = ?').bind(id).first(), 201)
  })

  /*
   * Editing a series only ever affects future occurrences: already-posted
   * transactions are never rewritten. Changing the schedule re-anchors
   * `occurrenceIndex` to the first occurrence that has not yet been posted.
   */
  api.patch('/recurring/:id', async (c) => {
    const db = c.env.DB
    const id = c.req.param('id')
    const existing = found(
      await db
        .prepare('SELECT * FROM recurringRules WHERE id = ?')
        .bind(id)
        .first<{
          kind: CategoryKind
          startDate: string
          frequency: Frequency
          intervalCount: number
          lastPostedOn: string | null
          occurrenceIndex: number
        }>(),
      'Recurring rule',
    )
    const input = await body(c, recurringRuleInputBaseSchema.partial())
    if (input.accountId) await assertAccountLive(db, input.accountId)
    await assertCategoryKind(db, input.categoryId, input.kind ?? existing.kind)

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

    const { sql, values } = setClause(patch)
    if (values.length) {
      await db.prepare(`UPDATE recurringRules SET ${sql} WHERE id = ?`).bind(...values, id).run()
    }
    return c.json(await db.prepare('SELECT * FROM recurringRules WHERE id = ?').bind(id).first())
  })

  // Stops future postings; everything already posted stays in history.
  api.delete('/recurring/:id', async (c) => {
    const db = c.env.DB
    const id = c.req.param('id')
    found(await db.prepare('SELECT id FROM recurringRules WHERE id = ?').bind(id).first(), 'Recurring rule')
    await db
      .prepare('UPDATE recurringRules SET deletedAt = ?, isActive = 0 WHERE id = ?')
      .bind(nowIso(), id)
      .run()
    return c.json({ ok: true })
  })

  /* --------------------------------------------------------- analytics --- */

  api.get('/analytics/summary', async (c) =>
    c.json(await dashboardSummary(c.env.DB, requireMonth(c), today())),
  )
  api.get('/analytics/net-worth', async (c) => c.json(await netWorthSeries(c.env.DB)))

  api.get('/analytics/monthly', async (c) => {
    const months = Math.min(Math.max(Number(c.req.query('months') ?? 12), 1), 60)
    return c.json(await monthlyTotals(c.env.DB, months, requireMonth(c)))
  })

  api.get('/analytics/by-category', async (c) => {
    const kind = c.req.query('kind') === 'income' ? 'income' : 'expense'
    return c.json(await totalsByCategory(c.env.DB, requireMonth(c), kind))
  })

  api.get('/analytics/budget-status', async (c) => c.json(await budgetStatus(c.env.DB, requireMonth(c))))

  /* -------------------------------------------------------------- jobs --- */

  api.post('/jobs/run', async (c) => c.json(await runJobs(c.env.DB)))

  api.get('/health', (c) => c.json({ ok: true, today: today() }))

  return api
}
