import { describe, expect, it } from 'vitest'
import { maxDrawdownPercent, sharpeRatio, windowedGain } from '../shared/portfolioStats.ts'
import type { PortfolioPoint } from '../shared/types.ts'

function point(date: string, valueCents: number, contributedCents: number, twrIndex: number): PortfolioPoint {
  return { date, valueCents, contributedCents, twrIndex }
}

describe('windowedGain', () => {
  it('is the value increase when there is no flow in the window', () => {
    const points = [
      point('2025-01-01', 10_000, 10_000, 1),
      point('2025-01-02', 11_000, 10_000, 1.1),
    ]
    const gain = windowedGain(points)
    expect(gain.gainCents).toBe(1_000)
    expect(gain.gainPercent).toBeCloseTo(10, 6)
  })

  it('excludes a mid-window contribution from the gain', () => {
    // Day 2 adds 5,000 in fresh cash on top of the day-1 value; only the
    // NAV move (twrIndex) should register as gain, not the new money.
    const points = [
      point('2025-01-01', 10_000, 10_000, 1),
      point('2025-01-02', 16_000, 15_000, 1.1),
    ]
    const gain = windowedGain(points)
    expect(gain.gainCents).toBe(1_000)
    expect(gain.gainPercent).toBeCloseTo(10, 6)
  })

  it('returns a null percent and zero gain for fewer than 2 points', () => {
    expect(windowedGain([point('2025-01-01', 10_000, 10_000, 1)])).toEqual({
      gainCents: 0,
      gainPercent: null,
    })
    expect(windowedGain([])).toEqual({ gainCents: 0, gainPercent: null })
  })
})

describe('maxDrawdownPercent', () => {
  it('is 0 for a monotonically increasing series', () => {
    const points = [
      point('2025-01-01', 10_000, 10_000, 1),
      point('2025-01-02', 11_000, 10_000, 1.1),
      point('2025-01-03', 12_000, 10_000, 1.2),
    ]
    expect(maxDrawdownPercent(points)).toBe(0)
  })

  it('finds the trough of a dip-then-recover series', () => {
    // Peaks at 1.0, drops to 0.8 (-20%), recovers to 0.95 (still under peak).
    const points = [
      point('2025-01-01', 10_000, 10_000, 1),
      point('2025-01-02', 9_000, 10_000, 0.9),
      point('2025-01-03', 8_000, 10_000, 0.8),
      point('2025-01-04', 9_500, 10_000, 0.95),
    ]
    expect(maxDrawdownPercent(points)).toBeCloseTo(-20, 6)
  })

  it('is null for fewer than 2 points', () => {
    expect(maxDrawdownPercent([point('2025-01-01', 10_000, 10_000, 1)])).toBeNull()
    expect(maxDrawdownPercent([])).toBeNull()
  })
})

describe('sharpeRatio', () => {
  it('is null for a flat series (zero standard deviation)', () => {
    const points = [
      point('2025-01-01', 10_000, 10_000, 1),
      point('2025-01-02', 10_000, 10_000, 1),
      point('2025-01-03', 10_000, 10_000, 1),
    ]
    expect(sharpeRatio(points)).toBeNull()
  })

  it('is positive for a steadily rising series with mixed step sizes', () => {
    const points = [
      point('2025-01-01', 10_000, 10_000, 1),
      point('2025-01-02', 10_100, 10_000, 1.01),
      point('2025-01-03', 10_150, 10_000, 1.015),
      point('2025-01-04', 10_300, 10_000, 1.03),
    ]
    const sharpe = sharpeRatio(points)
    expect(sharpe).not.toBeNull()
    expect(sharpe!).toBeGreaterThan(0)
  })

  it('is negative for a steadily falling series', () => {
    const points = [
      point('2025-01-01', 10_000, 10_000, 1),
      point('2025-01-02', 9_900, 10_000, 0.99),
      point('2025-01-03', 9_800, 10_000, 0.985),
      point('2025-01-04', 9_600, 10_000, 0.97),
    ]
    const sharpe = sharpeRatio(points)
    expect(sharpe).not.toBeNull()
    expect(sharpe!).toBeLessThan(0)
  })

  it('is null for fewer than 3 points', () => {
    expect(
      sharpeRatio([point('2025-01-01', 10_000, 10_000, 1), point('2025-01-02', 10_100, 10_000, 1.01)]),
    ).toBeNull()
    expect(sharpeRatio([])).toBeNull()
  })
})
