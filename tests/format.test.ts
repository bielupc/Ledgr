import { describe, expect, it } from 'vitest'
import {
  formatEuro,
  formatEuroCompact,
  formatPercentChange,
  splitAmount,
  toCents,
  toEuros,
} from '../src/lib/format.ts'

describe('money formatting', () => {
  it('renders EUR in the app locale', () => {
    // Non-breaking spaces vary by ICU build, so compare on the digits.
    const plain = (cents: number) => formatEuro(cents).replace(/\s/g, ' ')

    expect(plain(0)).toBe('0,00 €')
    expect(plain(-4_250)).toBe('-42,50 €')
    // es-ES leaves four-digit numbers ungrouped and groups from five up.
    expect(plain(123_456)).toBe('1234,56 €')
    expect(plain(1_234_567)).toBe('12.345,67 €')
  })

  it('round-trips euros and cents without drift', () => {
    expect(toCents(0.1 + 0.2)).toBe(30)
    expect(toCents(19.99)).toBe(1999)
    expect(toEuros(1999)).toBe(19.99)
  })

  it('splits an amount so decimals can be dimmed separately', () => {
    const parts = splitAmount(481_240)
    expect(parts.whole).toBe('4812')
    expect(parts.fraction).toBe(',40')
    expect(parts.currency).toBe('€')
    expect(parts.sign).toBe('')
    expect(splitAmount(1_234_567).whole).toBe('12.345')
  })

  it('carries the sign out of the whole part', () => {
    const parts = splitAmount(-9_900)
    expect(parts.sign).toBe('-')
    expect(parts.whole).toBe('99')
    expect(parts.fraction).toBe(',00')
  })

  it('states net worth movement as a signed percentage', () => {
    // The locale's non-breaking space before % is stripped: it reads as a gap.
    const pct = (a: number, b: number) => formatPercentChange(a, b)

    expect(pct(110_000, 100_000)).toBe('+10,0%')
    expect(pct(95_000, 100_000)).toBe('-5,0%')
    expect(pct(100_000, 100_000)).toBe('0,0%')
  })

  it('has no percentage to state against a zero baseline', () => {
    expect(formatPercentChange(5_000, 0)).toBeNull()
  })

  it('abbreviates axis figures with a magnitude suffix, not the locale word', () => {
    const compact = (cents: number) => formatEuroCompact(cents).replace(/\s/g, ' ')

    expect(compact(98_000)).toBe('980 €')
    expect(compact(250_050)).toBe('2,5K €')
    expect(compact(14_736_352)).toBe('147,4K €')
    expect(compact(120_549_980)).toBe('1,2M €')
    expect(compact(-450_000)).toBe('-4,5K €')
  })

  it('keeps the locale separators: . for thousands, , for cents', () => {
    expect(formatEuro(123_456_789).replace(/\s/g, ' ')).toBe('1.234.567,89 €')
  })
})
