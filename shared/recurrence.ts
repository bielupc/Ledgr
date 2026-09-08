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

const ORDINAL_SUFFIXES = ['th', 'st', 'nd', 'rd'] as const

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st, 31st. */
function ordinal(day: number): string {
  // The teens are the exception: 11, 12 and 13 all take "th" despite ending
  // in 1, 2 and 3.
  const suffix = day % 100 >= 11 && day % 100 <= 13 ? 'th' : (ORDINAL_SUFFIXES[day % 10] ?? 'th')
  return `${day}${suffix}`
}

/**
 * A rule's cadence as a sentence: "Monthly on the 31st", "Every 2 weeks on
 * Tuesday". Anchored to `startDate` because that is what the schedule is
 * measured from — the same anchor `occurrenceDate` steps from, so the sentence
 * and the postings can never describe different schedules.
 */
export function describeRecurrence(rule: {
  startDate: string
  frequency: Frequency
  intervalCount: number
}): string {
  const start = parseISO(rule.startDate)
  const every = rule.intervalCount > 1

  switch (rule.frequency) {
    case 'daily':
      return every ? `Every ${rule.intervalCount} days` : 'Every day'
    case 'weekly': {
      const weekday = format(start, 'EEEE')
      return every ? `Every ${rule.intervalCount} weeks on ${weekday}` : `Weekly on ${weekday}`
    }
    case 'monthly': {
      // The rule keeps its day of month even where a month is short, so the
      // sentence states the anchor day rather than the next posting's day.
      const day = ordinal(start.getDate())
      return every ? `Every ${rule.intervalCount} months on the ${day}` : `Monthly on the ${day}`
    }
    case 'yearly': {
      const day = format(start, 'd MMM')
      return every ? `Every ${rule.intervalCount} years on ${day}` : `Yearly on ${day}`
    }
  }
}
