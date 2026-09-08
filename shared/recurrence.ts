import { addDays, addMonths, addWeeks, addYears, format, parseISO } from 'date-fns'
import type { Frequency } from './schemas.ts'

/** Guards against a malformed rule spinning the catch-up loop forever. */
export const MAX_CATCH_UP_OCCURRENCES = 2000

/**
 * The `index`-th occurrence of a rule, always measured from `startDate` rather
 * than by stepping a cursor forward one interval at a time.
 *
 * The distinction matters at month ends. Stepping Jan 31 forward clamps to
 * Feb 28, and every later step then anchors on the 28th — the series silently
 * loses its day-of-month. Measuring from the anchor gives Jan 31, Feb 28,
 * Mar 31, which is what a rule "on the 31st" means.
 */
export function occurrenceDate(
  startDate: string,
  frequency: Frequency,
  intervalCount: number,
  index: number,
): string {
  const start = parseISO(startDate)
  const steps = intervalCount * index

  switch (frequency) {
    case 'daily':
      return format(addDays(start, steps), 'yyyy-MM-dd')
    case 'weekly':
      return format(addWeeks(start, steps), 'yyyy-MM-dd')
    case 'monthly':
      return format(addMonths(start, steps), 'yyyy-MM-dd')
    case 'yearly':
      return format(addYears(start, steps), 'yyyy-MM-dd')
  }
}

/** Every occurrence due on or before `throughDate`, starting at `fromIndex`. */
export function dueOccurrences(
  rule: {
    startDate: string
    endDate?: string | null
    frequency: Frequency
    intervalCount: number
  },
  fromIndex: number,
  throughDate: string,
): { index: number; date: string }[] {
  const due: { index: number; date: string }[] = []

  for (let i = fromIndex; i < fromIndex + MAX_CATCH_UP_OCCURRENCES; i += 1) {
    const date = occurrenceDate(rule.startDate, rule.frequency, rule.intervalCount, i)
    if (date > throughDate) break
    if (rule.endDate && date > rule.endDate) break
    due.push({ index: i, date })
  }

  return due
}
