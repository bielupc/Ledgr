import { format, parseISO, subDays, subMonths } from 'date-fns'
import type {
  AccountBalance,
  BudgetStatus,
  CategoryTotal,
  DashboardSummary,
  MonthlyTotals,
  NetWorthSnapshot,
  Page,
  TransactionRow,
  TransferRow,
} from '../shared/types.ts'
import type {
  CategoryKind,
  TransactionQuery,
  TransactionSort,
  TransferQuery,
  TransferSort,
} from '../shared/schemas.ts'
import type { DB } from './db.ts'

export function monthBounds(month: string): { start: string; end: string } {
  const start = `${month}-01`
  const next = parseISO(start)
  next.setMonth(next.getMonth() + 1)
  return { start, end: `${format(next, 'yyyy-MM')}-01` }
}

/** Net worth is the sum of live account balances as they stood on `date`. */
export async function netWorthAsOf(db: DB, date: string): Promise<number> {
  // ?1 rather than four separate binds: the same date is read four times and
  // D1's ordered params let one bound value be referenced repeatedly.
  const row = await db
    .prepare(
      `SELECT coalesce(sum(
         a.initialBalanceCents
         + coalesce((SELECT sum(t.amountCents) FROM transactions t
                     WHERE t.accountId = a.id AND t.kind = 'income'
                       AND t.occurredOn <= ?1), 0)
         - coalesce((SELECT sum(t.amountCents) FROM transactions t
                     WHERE t.accountId = a.id AND t.kind = 'expense'
                       AND t.occurredOn <= ?1), 0)
         + coalesce((SELECT sum(r.amountCents) FROM transfers r
                     WHERE r.toAccountId = a.id AND r.occurredOn <= ?1), 0)
         - coalesce((SELECT sum(r.amountCents) FROM transfers r
                     WHERE r.fromAccountId = a.id AND r.occurredOn <= ?1), 0)
       ), 0) AS total
       FROM accounts a
       WHERE a.deletedAt IS NULL`,
    )
    .bind(date)
    .first<{ total: number }>()

  return row!.total
}

export async function listAccountBalances(db: DB, includeDeleted = false): Promise<AccountBalance[]> {
  const { results } = await db
    .prepare(
      `SELECT id, name, icon, sortOrder, deletedAt, initialBalanceCents, balanceCents
       FROM accountBalances
       ${includeDeleted ? '' : 'WHERE deletedAt IS NULL'}
       ORDER BY sortOrder, name`,
    )
    .all<AccountBalance>()
  return results
}

/*
 * Sort keys are mapped to SQL here rather than interpolated from the request:
 * the zod enum guarantees the key is one of these, and this table is the only
 * place a column name reaches the ORDER BY clause. `name` sorts on the label
 * the row actually renders, which falls back to the category.
 */
const TRANSACTION_SORT_SQL: Record<TransactionSort, string> = {
  occurredOn: 't.occurredOn',
  amountCents: 't.amountCents',
  name: "coalesce(t.name, c.name, '')",
  categoryName: "coalesce(c.name, '')",
  accountName: 'a.name',
}

const TRANSFER_SORT_SQL: Record<TransferSort, string> = {
  occurredOn: 'r.occurredOn',
  amountCents: 'r.amountCents',
  note: "coalesce(r.note, '')",
}

export async function listTransactions(
  db: DB,
  query: TransactionQuery,
): Promise<Page<TransactionRow>> {
  const where: string[] = []
  const params: unknown[] = []

  if (query.month) {
    const { start, end } = monthBounds(query.month)
    where.push('t.occurredOn >= ? AND t.occurredOn < ?')
    params.push(start, end)
  }
  if (query.from) {
    where.push('t.occurredOn >= ?')
    params.push(query.from)
  }
  if (query.to) {
    where.push('t.occurredOn <= ?')
    params.push(query.to)
  }
  if (query.kind) {
    where.push('t.kind = ?')
    params.push(query.kind)
  }
  if (query.accountId) {
    where.push('t.accountId = ?')
    params.push(query.accountId)
  }
  if (query.categoryId) {
    where.push('t.categoryId = ?')
    params.push(query.categoryId)
  }
  if (query.search) {
    where.push('(t.name LIKE ? OR c.name LIKE ? OR a.name LIKE ?)')
    const term = `%${query.search}%`
    params.push(term, term, term)
  }

  // Accounts and categories join without a deletedAt filter: a soft-deleted
  // one must still render its name in the history it belongs to.
  const from = `FROM transactions t
       JOIN accounts a ON a.id = t.accountId
       LEFT JOIN categories c ON c.id = t.categoryId
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`

  const direction = query.dir === 'asc' ? 'ASC' : 'DESC'

  /*
   * The page and its count ride in one `db.batch()`: they must see the same
   * rows, and D1 has no transaction wrapper to hold them together otherwise.
   */
  const [page, totals] = await db.batch<never>([
    db
      .prepare(
        `SELECT t.*,
              a.name AS accountName, a.icon AS accountIcon,
              c.name AS categoryName, c.icon AS categoryIcon, c.color AS categoryColor
       ${from}
       ORDER BY ${TRANSACTION_SORT_SQL[query.sort]} ${direction}, t.createdAt DESC
       LIMIT ? OFFSET ?`,
      )
      .bind(...params, query.limit, query.offset),
    db
      .prepare(
        `SELECT count(*) AS total ${from}`,
      )
      .bind(...params),
  ])

  const counted = (totals!.results as unknown as { total: number }[])[0]

  return {
    rows: page!.results as unknown as TransactionRow[],
    total: counted?.total ?? 0,
  }
}

export async function getTransactionRow(db: DB, id: string): Promise<TransactionRow | undefined> {
  const row = await db
    .prepare(
      `SELECT t.*,
              a.name AS accountName, a.icon AS accountIcon,
              c.name AS categoryName, c.icon AS categoryIcon, c.color AS categoryColor
       FROM transactions t
       JOIN accounts a ON a.id = t.accountId
       LEFT JOIN categories c ON c.id = t.categoryId
       WHERE t.id = ?`,
    )
    .bind(id)
    .first<TransactionRow>()
  return row ?? undefined
}

export async function getTransferRow(db: DB, id: string): Promise<TransferRow | undefined> {
  const row = await db
    .prepare(
      `SELECT r.*,
              af.name AS fromAccountName, af.icon AS fromAccountIcon,
              at2.name AS toAccountName,  at2.icon AS toAccountIcon
       FROM transfers r
       JOIN accounts af  ON af.id  = r.fromAccountId
       JOIN accounts at2 ON at2.id = r.toAccountId
       WHERE r.id = ?`,
    )
    .bind(id)
    .first<TransferRow>()
  return row ?? undefined
}

export async function listTransfers(db: DB, query: TransferQuery): Promise<Page<TransferRow>> {
  const where: string[] = []
  const params: unknown[] = []

  if (query.month) {
    const { start, end } = monthBounds(query.month)
    where.push('r.occurredOn >= ? AND r.occurredOn < ?')
    params.push(start, end)
  }
  if (query.from) {
    where.push('r.occurredOn >= ?')
    params.push(query.from)
  }
  if (query.to) {
    where.push('r.occurredOn <= ?')
    params.push(query.to)
  }
  if (query.accountId) {
    where.push('(r.fromAccountId = ? OR r.toAccountId = ?)')
    params.push(query.accountId, query.accountId)
  }
  if (query.search) {
    where.push('(r.note LIKE ? OR af.name LIKE ? OR at2.name LIKE ?)')
    const term = `%${query.search}%`
    params.push(term, term, term)
  }

  const from = `FROM transfers r
       JOIN accounts af  ON af.id  = r.fromAccountId
       JOIN accounts at2 ON at2.id = r.toAccountId
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`

  const direction = query.dir === 'asc' ? 'ASC' : 'DESC'

  const [page, totals] = await db.batch<never>([
    db
      .prepare(
        `SELECT r.*,
              af.name AS fromAccountName, af.icon AS fromAccountIcon,
              at2.name AS toAccountName,  at2.icon AS toAccountIcon
       ${from}
       ORDER BY ${TRANSFER_SORT_SQL[query.sort]} ${direction}, r.createdAt DESC
       LIMIT ? OFFSET ?`,
      )
      .bind(...params, query.limit, query.offset),
    db
      .prepare(
        `SELECT count(*) AS total ${from}`,
      )
      .bind(...params),
  ])

  const counted = (totals!.results as unknown as { total: number }[])[0]

  return {
    rows: page!.results as unknown as TransferRow[],
    total: counted?.total ?? 0,
  }
}

/**
 * Income/expense totals per month, zero-filled so the chart has no gaps.
 * Reads `transactions` only — transfers are internal movement, not activity.
 */
export async function monthlyTotals(db: DB, months: number, endMonth: string): Promise<MonthlyTotals[]> {
  const first = format(subMonths(parseISO(`${endMonth}-01`), months - 1), 'yyyy-MM')
  const { end } = monthBounds(endMonth)

  const { results: rows } = await db
    .prepare(
      `SELECT substr(occurredOn, 1, 7) AS month,
              sum(CASE WHEN kind = 'income'  THEN amountCents ELSE 0 END) AS incomeCents,
              sum(CASE WHEN kind = 'expense' THEN amountCents ELSE 0 END) AS expenseCents
       FROM transactions
       WHERE occurredOn >= ? AND occurredOn < ?
       GROUP BY month`,
    )
    .bind(`${first}-01`, end)
    .all<Pick<MonthlyTotals, 'month' | 'incomeCents' | 'expenseCents'>>()

  const byMonth = new Map(rows.map((r) => [r.month, r]))

  return Array.from({ length: months }, (_, i) => {
    const month = format(subMonths(parseISO(`${endMonth}-01`), months - 1 - i), 'yyyy-MM')
    const row = byMonth.get(month)
    const incomeCents = row?.incomeCents ?? 0
    const expenseCents = row?.expenseCents ?? 0
    return { month, incomeCents, expenseCents, balanceCents: incomeCents - expenseCents }
  })
}

export async function totalsByCategory(
  db: DB,
  month: string,
  kind: CategoryKind,
): Promise<CategoryTotal[]> {
  const { start, end } = monthBounds(month)

  const { results } = await db
    .prepare(
      `SELECT t.categoryId AS categoryId,
              coalesce(c.name, 'Uncategorised') AS categoryName,
              coalesce(c.icon, 'circle-help')   AS categoryIcon,
              c.color AS categoryColor,
              sum(t.amountCents) AS totalCents
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.categoryId
       WHERE t.kind = ? AND t.occurredOn >= ? AND t.occurredOn < ?
       GROUP BY t.categoryId
       HAVING totalCents > 0
       ORDER BY totalCents DESC`,
    )
    .bind(kind, start, end)
    .all<CategoryTotal>()
  return results
}

export async function budgetStatus(db: DB, month: string): Promise<BudgetStatus[]> {
  const { start, end } = monthBounds(month)

  const { results } = await db
    .prepare(
      `SELECT b.categoryId,
              c.name  AS categoryName,
              c.icon  AS categoryIcon,
              c.color AS categoryColor,
              b.amountCents AS budgetCents,
              coalesce((SELECT sum(t.amountCents) FROM transactions t
                        WHERE t.categoryId = b.categoryId AND t.kind = 'expense'
                          AND t.occurredOn >= ?1 AND t.occurredOn < ?2), 0) AS spentCents
       FROM budgets b
       JOIN categories c ON c.id = b.categoryId
       WHERE c.deletedAt IS NULL
       ORDER BY spentCents * 1.0 / max(b.amountCents, 1) DESC, c.name`,
    )
    .bind(start, end)
    .all<BudgetStatus>()
  return results
}

export async function netWorthSeries(db: DB): Promise<NetWorthSnapshot[]> {
  const { results } = await db
    .prepare(`SELECT capturedOn, amountCents FROM netWorthSnapshots ORDER BY capturedOn`)
    .all<NetWorthSnapshot>()
  return results
}

export async function dashboardSummary(
  db: DB,
  month: string,
  today: string,
): Promise<DashboardSummary> {
  const { start, end } = monthBounds(month)

  const totals = await db
    .prepare(
      `SELECT
         coalesce(sum(CASE WHEN kind = 'income'  THEN amountCents END), 0) AS incomeCents,
         coalesce(sum(CASE WHEN kind = 'expense' THEN amountCents END), 0) AS expenseCents
       FROM transactions
       WHERE occurredOn >= ? AND occurredOn < ?`,
    )
    .bind(start, end)
    .first<{ incomeCents: number; expenseCents: number }>()

  /*
   * Net worth is stated as of the selected month's end — or today when that
   * month is still running. Reporting the live figure while viewing a past
   * month compared a present-day total against an old one and still called it
   * "since last month".
   */
  const lastDayOfMonth = format(subDays(parseISO(end), 1), 'yyyy-MM-dd')
  const asOf = lastDayOfMonth > today ? today : lastDayOfMonth
  const previousMonthEnd = format(subDays(parseISO(start), 1), 'yyyy-MM-dd')

  // Opening balances count as prior net worth, so the comparison is missing
  // only when there is no account to compare at all.
  const anyAccount = await db
    .prepare('SELECT 1 AS present FROM accounts WHERE deletedAt IS NULL LIMIT 1')
    .first<{ present: number }>()

  return {
    netWorthCents: await netWorthAsOf(db, asOf),
    monthIncomeCents: totals!.incomeCents,
    monthExpenseCents: totals!.expenseCents,
    monthBalanceCents: totals!.incomeCents - totals!.expenseCents,
    previousNetWorthCents: anyAccount ? await netWorthAsOf(db, previousMonthEnd) : null,
  }
}
