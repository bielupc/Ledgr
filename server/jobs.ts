import { endOfMonth, format, parseISO } from 'date-fns'
import { dueOccurrences, occurrenceDate } from '../shared/recurrence.ts'
import type { RecurringRule } from '../shared/types.ts'
import { newId, today, type DB } from './db.ts'
import { netWorthAsOf } from './queries.ts'

export interface JobReport {
  postedTransactions: number
  snapshotsWritten: number
}

/**
 * Posts every occurrence that has come due, catching up however many were
 * missed while the app was closed. Safe to run repeatedly: the partial unique
 * index on (recurringRuleId, occurredOn) absorbs any re-posting.
 */
export function postDueRecurring(db: DB, throughDate: string = today()): number {
  const rules = db
    .prepare(
      `SELECT * FROM recurringRules
       WHERE deletedAt IS NULL AND isActive = 1 AND nextRunOn <= ?`,
    )
    .all(throughDate) as RecurringRule[]

  const insert = db.prepare(
    `INSERT OR IGNORE INTO transactions
       (id, kind, occurredOn, amountCents, accountId, categoryId, name, icon, recurringRuleId)
     VALUES (@id, @kind, @occurredOn, @amountCents, @accountId, @categoryId, @name, NULL, @recurringRuleId)`,
  )
  const advance = db.prepare(
    `UPDATE recurringRules
       SET occurrenceIndex = @occurrenceIndex,
           nextRunOn = @nextRunOn,
           lastPostedOn = @lastPostedOn,
           isActive = @isActive
     WHERE id = @id`,
  )

  let posted = 0

  const run = db.transaction(() => {
    for (const rule of rules) {
      const due = dueOccurrences(rule, rule.occurrenceIndex, throughDate)
      if (due.length === 0) continue

      for (const occurrence of due) {
        const result = insert.run({
          id: newId(),
          kind: rule.kind,
          occurredOn: occurrence.date,
          amountCents: rule.amountCents,
          accountId: rule.accountId,
          categoryId: rule.categoryId,
          name: rule.name,
          recurringRuleId: rule.id,
        })
        posted += result.changes
      }

      const nextIndex = due[due.length - 1]!.index + 1
      const nextRunOn = occurrenceDate(
        rule.startDate,
        rule.frequency,
        rule.intervalCount,
        nextIndex,
      )
      const exhausted = Boolean(rule.endDate && nextRunOn > rule.endDate)

      advance.run({
        id: rule.id,
        occurrenceIndex: nextIndex,
        nextRunOn,
        lastPostedOn: due[due.length - 1]!.date,
        isActive: exhausted ? 0 : 1,
      })
    }
  })

  run()
  return posted
}

/**
 * Snapshots are keyed to the first of the month and hold net worth as of that
 * month's end — or as of today for the month still in progress, which is why
 * re-running within a month updates the row rather than adding one.
 */
export function captureNetWorthSnapshot(db: DB, onDate: string = today()): void {
  const monthKey = `${onDate.slice(0, 7)}-01`
  const monthEnd = format(endOfMonth(parseISO(monthKey)), 'yyyy-MM-dd')
  const valuedOn = monthEnd > onDate ? onDate : monthEnd

  db.prepare(
    `INSERT INTO netWorthSnapshots (id, capturedOn, amountCents)
     VALUES (@id, @capturedOn, @amountCents)
     ON CONFLICT (capturedOn) DO UPDATE SET amountCents = excluded.amountCents`,
  ).run({
    id: newId(),
    capturedOn: monthKey,
    amountCents: netWorthAsOf(db, valuedOn),
  })
}

/**
 * Fills in months between the earliest recorded activity and now. Without this
 * the net worth chart is a single point until the app has run for months.
 */
export function backfillNetWorthSnapshots(db: DB, throughDate: string = today()): number {
  const earliest = db
    .prepare(
      `SELECT min(d) AS first FROM (
         SELECT min(occurredOn) AS d FROM transactions
         UNION ALL SELECT min(occurredOn) FROM transfers
         UNION ALL SELECT min(date(createdAt)) FROM accounts
       )`,
    )
    .get() as { first: string | null }

  if (!earliest.first) return 0

  let cursor = `${earliest.first.slice(0, 7)}-01`
  const lastMonth = `${throughDate.slice(0, 7)}-01`
  let written = 0

  const run = db.transaction(() => {
    while (cursor <= lastMonth) {
      captureNetWorthSnapshot(db, cursor === lastMonth ? throughDate : cursor)
      written += 1
      const next = parseISO(cursor)
      next.setMonth(next.getMonth() + 1)
      cursor = `${format(next, 'yyyy-MM')}-01`
    }
  })

  run()
  return written
}

export function runJobs(db: DB, throughDate: string = today()): JobReport {
  const postedTransactions = postDueRecurring(db, throughDate)
  const snapshotsWritten = backfillNetWorthSnapshots(db, throughDate)
  return { postedTransactions, snapshotsWritten }
}
