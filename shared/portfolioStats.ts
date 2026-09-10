import type { PortfolioPoint } from './types.ts'

/**
 * € and % gained across the window, net of any contributions/withdrawals in
 * it — mirrors the all-time `gainCents`/`gainPercent` shape `/investments/
 * summary` returns (`server/api.ts`), but over `points`'s own window rather
 * than from zero. `gainPercent` reads straight off `twrIndex`: callers pass
 * an already range-sliced series (see `sliceRange` in
 * `src/features/investments/range.ts`), which rebases `twrIndex` to 1 at the
 * window's first point.
 */
export function windowedGain(points: PortfolioPoint[]): {
  gainCents: number
  gainPercent: number | null
} {
  if (points.length < 2) return { gainCents: 0, gainPercent: null }
  const first = points[0]!
  const last = points[points.length - 1]!
  const gainCents =
    last.valueCents - first.valueCents - (last.contributedCents - first.contributedCents)
  return { gainCents, gainPercent: (last.twrIndex - 1) * 100 }
}

/**
 * Largest peak-to-trough decline in `twrIndex` within the window, as a
 * percent (always ≤ 0; 0 if the window never dipped below its own running
 * peak). Uses `twrIndex` rather than `valueCents` so a withdrawal mid-window
 * isn't mistaken for a loss — the same flow-neutral reasoning `dailySeries`
 * (`server/portfolio.ts`) already applies to `twrIndex` itself.
 */
export function maxDrawdownPercent(points: PortfolioPoint[]): number | null {
  if (points.length < 2) return null
  let peak = points[0]!.twrIndex
  let worst = 0
  for (const point of points) {
    peak = Math.max(peak, point.twrIndex)
    worst = Math.min(worst, point.twrIndex / peak - 1)
  }
  return worst * 100
}

/**
 * Annualized Sharpe ratio from the window's daily returns (consecutive
 * `twrIndex` ratios), assuming a 0% risk-free rate — the usual simplification
 * for a personal portfolio with no bond-yield data source. Annualized by
 * √365 since `dailySeries` walks every calendar day, not just trading days.
 * `null` when there are fewer than 2 return observations or the sample is
 * flat (stddev 0) — callers should render that as "—", not 0 or Infinity.
 */
export function sharpeRatio(points: PortfolioPoint[]): number | null {
  if (points.length < 3) return null
  const returns: number[] = []
  for (let i = 1; i < points.length; i++) {
    returns.push(points[i]!.twrIndex / points[i - 1]!.twrIndex - 1)
  }
  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length
  const variance =
    returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length - 1)
  const stdDev = Math.sqrt(variance)
  if (stdDev === 0) return null
  return (mean / stdDev) * Math.sqrt(365)
}
