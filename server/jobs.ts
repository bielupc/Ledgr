import { endOfMonth, format, parseISO } from 'date-fns'
import { dueOccurrences, occurrenceDate } from '../shared/recurrence.ts'
import type { RecurringRule } from '../shared/types.ts'
import { newId, today, type DB } from './db.ts'
import { syncFundPrices } from './prices.ts'
import { netWorthAsOf } from './queries.ts'

export interface JobReport {
  postedTransactions: number
  pricesUpdated: number
  snapshotsWritten: number
}

/**
 * Posts every occurrence that has come due, catching up however many were
 * missed while the app was closed. Safe to run repeatedly: the partial unique
 * index on (recurringRuleId, occurredOn) absorbs any re-posting.
 *
 * D1 has no imperative `db.transaction(fn)` the way better-sqlite3 does —
 * atomicity comes from collecting every bound statement while looping (no
 * execution inside the loop) and running them all in one `db.batch()` call.
 */
export async function postDueRecurring(db: DB, throughDate: string = today()): Promise<number> {
  const { results: rules } = await db
    .prepare(
      `SELECT * FROM recurringRules
       WHERE deletedAt IS NULL AND isActive = 1 AND nextRunOn <= ?`,
    )
    .bind(throughDate)
    .all<RecurringRule>()

  const insertSql = `INSERT OR IGNORE INTO transactions
       (id, kind, occurredOn, amountCents, accountId, categoryId, name, icon, recurringRuleId)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)`
  const advanceSql = `UPDATE recurringRules
       SET occurrenceIndex = ?, nextRunOn = ?, lastPostedOn = ?, isActive = ?
     WHERE id = ?`

  // Tagged so the count below can sum only the inserts' `changes` — the
  // advance UPDATEs ride in the same batch but aren't postings.
  const ops: { stmt: D1PreparedStatement; isInsert: boolean }[] = []

  for (const rule of rules) {
    const due = dueOccurrences(rule, rule.occurrenceIndex, throughDate)
    if (due.length === 0) continue

    for (const occurrence of due) {
      ops.push({
        isInsert: true,
        stmt: db
          .prepare(insertSql)
          .bind(
            newId(),
            rule.kind,
            occurrence.date,
            rule.amountCents,
            rule.accountId,
            rule.categoryId,
            rule.name,
            rule.id,
          ),
      })
    }

    const nextIndex = due[due.length - 1]!.index + 1
    const nextRunOn = occurrenceDate(rule.startDate, rule.frequency, rule.intervalCount, nextIndex)
    const exhausted = Boolean(rule.endDate && nextRunOn > rule.endDate)

    ops.push({
      isInsert: false,
      stmt: db
        .prepare(advanceSql)
        .bind(nextIndex, nextRunOn, due[due.length - 1]!.date, exhausted ? 0 : 1, rule.id),
    })
  }

  if (ops.length === 0) return 0

  const results = await db.batch(ops.map((op) => op.stmt))
  return results.reduce(
    (posted, result, index) => posted + (ops[index]!.isInsert ? (result.meta.changes ?? 0) : 0),
    0,
  )
}

/**
 * Snapshots are keyed to the first of the month and hold net worth as of that
 * month's end — or as of today for the month still in progress, which is why
 * re-running within a month updates the row rather than adding one.
 */
export async function captureNetWorthSnapshot(db: DB, onDate: string = today()): Promise<void> {
  const monthKey = `${onDate.slice(0, 7)}-01`
  const monthEnd = format(endOfMonth(parseISO(monthKey)), 'yyyy-MM-dd')
  const valuedOn = monthEnd > onDate ? onDate : monthEnd

  const amountCents = await netWorthAsOf(db, valuedOn)

  await db
    .prepare(
      `INSERT INTO netWorthSnapshots (id, capturedOn, amountCents)
       VALUES (?, ?, ?)
       ON CONFLICT (capturedOn) DO UPDATE SET amountCents = excluded.amountCents`,
    )
    .bind(newId(), monthKey, amountCents)
    .run()
}

/**
 * Fills in months between the earliest recorded activity and now. Without
 * this the net worth chart is a single point until the app has run for
 * months.
 *
 * Each iteration reads current balances before it can write a snapshot, so
 * unlike `postDueRecurring` this can't be collected into one `db.batch()` —
 * the statements aren't independent. It also doesn't need to be: a crash
 * mid-backfill just leaves some months uncaptured, and the next scheduled run
 * (or the next dashboard load) fills them in the same idempotent way.
 */
export async function backfillNetWorthSnapshots(db: DB, throughDate: string = today()): Promise<number> {
  const earliest = await db
    .prepare(
      `SELECT min(d) AS first FROM (
         SELECT min(occurredOn) AS d FROM transactions
         UNION ALL SELECT min(occurredOn) FROM transfers
         UNION ALL SELECT min(date(createdAt)) FROM accounts
       )`,
    )
    .first<{ first: string | null }>()

  if (!earliest?.first) return 0

  let cursor = `${earliest.first.slice(0, 7)}-01`
  const lastMonth = `${throughDate.slice(0, 7)}-01`
  let written = 0

  while (cursor <= lastMonth) {
    // A past month is valued at its end, not at `cursor` (its first day):
    // captureNetWorthSnapshot clamps to whichever of the two is earlier, so
    // passing the first would key every historical row to a month's opening
    // balance while labelling it that month's close.
    const monthEnd = format(endOfMonth(parseISO(cursor)), 'yyyy-MM-dd')
    await captureNetWorthSnapshot(db, cursor === lastMonth ? throughDate : monthEnd)
    written += 1
    const next = parseISO(cursor)
    next.setMonth(next.getMonth() + 1)
    cursor = `${format(next, 'yyyy-MM')}-01`
  }

  return written
}

export async function runJobs(db: DB, throughDate: string = today()): Promise<JobReport> {
  const postedTransactions = await postDueRecurring(db, throughDate)
  // Independent of net worth — the portfolio has no effect on account
  // balances — but shares this same scheduled entry point.
  const pricesUpdated = await syncFundPrices(db, fetch)
  const snapshotsWritten = await backfillNetWorthSnapshots(db, throughDate)
  return { postedTransactions, pricesUpdated, snapshotsWritten }
}
