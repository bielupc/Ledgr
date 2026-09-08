import { describe, expect, it } from 'vitest'
import {
  describeRecurrence,
  dueOccurrences,
  monthlyEquivalentCents,
  occurrenceDate,
} from '../shared/recurrence.ts'

describe('occurrenceDate', () => {
  it('returns the start date at index 0', () => {
    expect(occurrenceDate('2026-03-15', 'monthly', 1, 0)).toBe('2026-03-15')
  })

  it('steps daily, weekly and yearly series', () => {
    expect(occurrenceDate('2026-01-01', 'daily', 1, 9)).toBe('2026-01-10')
    expect(occurrenceDate('2026-01-01', 'weekly', 2, 3)).toBe('2026-02-12')
    expect(occurrenceDate('2026-01-01', 'yearly', 1, 2)).toBe('2028-01-01')
  })

  /*
   * The reason occurrences are measured from the anchor. Stepping a cursor
   * would clamp Jan 31 to Feb 28 and then stay on the 28th for every later
   * month; measuring from the start recovers the 31st wherever it exists.
   */
  it('keeps a month-end series anchored to its day of month', () => {
    const dates = [0, 1, 2, 3, 4].map((i) =>
      occurrenceDate('2026-01-31', 'monthly', 1, i),
    )
    expect(dates).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
    ])
  })

  it('recovers 29 February on a leap year', () => {
    expect(occurrenceDate('2024-02-29', 'yearly', 1, 1)).toBe('2025-02-28')
    expect(occurrenceDate('2024-02-29', 'yearly', 1, 4)).toBe('2028-02-29')
  })

  it('honours an interval greater than one', () => {
    expect(occurrenceDate('2026-01-15', 'monthly', 3, 2)).toBe('2026-07-15')
  })
})

describe('dueOccurrences', () => {
  const rule = {
    startDate: '2026-01-01',
    frequency: 'monthly' as const,
    intervalCount: 1,
    endDate: null,
  }

  it('collects every occurrence up to and including the through date', () => {
    const due = dueOccurrences(rule, 0, '2026-03-01')
    expect(due.map((d) => d.date)).toEqual(['2026-01-01', '2026-02-01', '2026-03-01'])
  })

  it('resumes from the given index without re-emitting posted occurrences', () => {
    const due = dueOccurrences(rule, 2, '2026-04-15')
    expect(due.map((d) => d.date)).toEqual(['2026-03-01', '2026-04-01'])
    expect(due[0]?.index).toBe(2)
  })

  it('stops at the end date', () => {
    const due = dueOccurrences({ ...rule, endDate: '2026-02-15' }, 0, '2026-06-01')
    expect(due.map((d) => d.date)).toEqual(['2026-01-01', '2026-02-01'])
  })

  it('returns nothing before the series starts', () => {
    expect(dueOccurrences(rule, 0, '2025-12-31')).toEqual([])
  })
})

describe('describeRecurrence', () => {
  it('names the cadence of a simple series', () => {
    expect(describeRecurrence({ startDate: '2026-03-15', frequency: 'daily', intervalCount: 1 }))
      .toBe('Every day')
    expect(describeRecurrence({ startDate: '2026-03-17', frequency: 'weekly', intervalCount: 1 }))
      .toBe('Weekly on Tuesday')
    expect(describeRecurrence({ startDate: '2026-03-15', frequency: 'monthly', intervalCount: 1 }))
      .toBe('Monthly on the 15th')
    expect(describeRecurrence({ startDate: '2026-03-15', frequency: 'yearly', intervalCount: 1 }))
      .toBe('Yearly on 15 Mar')
  })

  it('states the interval when a series skips periods', () => {
    expect(describeRecurrence({ startDate: '2026-01-01', frequency: 'daily', intervalCount: 3 }))
      .toBe('Every 3 days')
    expect(describeRecurrence({ startDate: '2026-03-17', frequency: 'weekly', intervalCount: 2 }))
      .toBe('Every 2 weeks on Tuesday')
    expect(describeRecurrence({ startDate: '2026-03-01', frequency: 'monthly', intervalCount: 6 }))
      .toBe('Every 6 months on the 1st')
  })

  /* The suffix rule the sentence is most likely to get wrong. */
  it('spells the ordinals, teens included', () => {
    const monthly = (day: string) =>
      describeRecurrence({ startDate: `2026-01-${day}`, frequency: 'monthly', intervalCount: 1 })

    expect(monthly('01')).toBe('Monthly on the 1st')
    expect(monthly('02')).toBe('Monthly on the 2nd')
    expect(monthly('03')).toBe('Monthly on the 3rd')
    expect(monthly('11')).toBe('Monthly on the 11th')
    expect(monthly('12')).toBe('Monthly on the 12th')
    expect(monthly('13')).toBe('Monthly on the 13th')
    expect(monthly('21')).toBe('Monthly on the 21st')
    expect(monthly('31')).toBe('Monthly on the 31st')
  })

  /* The sentence has to describe the anchor, not the next posting: a rule on
   * the 31st still says "the 31st" in a February that has no 31st. */
  it('describes the anchor day even where a month is short of it', () => {
    expect(describeRecurrence({ startDate: '2026-01-31', frequency: 'monthly', intervalCount: 1 }))
      .toBe('Monthly on the 31st')
  })
})

/*
 * Rules only compare once they are on the same footing, and the conversion has
 * to use the mean calendar month: a weekly charge is not four monthly ones.
 */
describe('monthlyEquivalentCents', () => {
  const at = (frequency: 'daily' | 'weekly' | 'monthly' | 'yearly', amountCents: number, intervalCount = 1) =>
    monthlyEquivalentCents({ amountCents, frequency, intervalCount })

  it('passes a monthly rule through untouched', () => {
    expect(at('monthly', 45000)).toBe(45000)
  })

  it('spreads a yearly rule across twelve months', () => {
    expect(at('yearly', 12000)).toBe(1000)
  })

  it('uses the mean month, so a weekly rule is more than four payments', () => {
    // 365.25 / 7 / 12 = 4.348 weeks, not 4.
    expect(at('weekly', 10000)).toBe(43482)
    expect(at('daily', 100)).toBe(3044)
  })

  it('divides by the interval, so every-other-week is half of weekly', () => {
    expect(at('weekly', 10000, 2)).toBe(21741)
    expect(at('monthly', 45000, 3)).toBe(15000)
    expect(at('yearly', 12000, 2)).toBe(500)
  })

  /* A rule that arrives with a zero interval must not divide by zero and blow
   * the whole ring's total into NaN. */
  it('treats a zero interval as one rather than dividing by it', () => {
    expect(at('monthly', 45000, 0)).toBe(45000)
  })
})
