import { subMonths, subYears } from 'date-fns'
import type { PortfolioPoint } from '@shared/types.ts'

export const RANGES = ['1M', '3M', '6M', 'YTD', '1Y', 'All'] as const
export type Range = (typeof RANGES)[number]

function cutoffFor(range: Range, latest: Date): Date | null {
  switch (range) {
    case '1M':
      return subMonths(latest, 1)
    case '3M':
      return subMonths(latest, 3)
    case '6M':
      return subMonths(latest, 6)
    case 'YTD':
      return new Date(latest.getFullYear(), 0, 1)
    case '1Y':
      return subYears(latest, 1)
    case 'All':
      return null
  }
}

/**
 * Slices the full series to a range and rebases its TWR index to 1 at the
 * slice's own first point, so the performance chart reads that window's
 * return rather than the return since the portfolio's very first day. The
 * full series is fetched once (see `usePortfolioSeries`) and every range
 * switch is this cheap client-side reslice, not a refetch.
 */
export function sliceRange(points: PortfolioPoint[], range: Range): PortfolioPoint[] {
  if (points.length === 0) return []
  const latest = new Date(points[points.length - 1]!.date)
  const cutoff = cutoffFor(range, latest)
  const from = cutoff ? points.findIndex((p) => new Date(p.date) >= cutoff) : 0
  const slice = points.slice(from === -1 ? points.length - 1 : from)
  const base = slice[0]?.twrIndex ?? 1
  return slice.map((p) => ({ ...p, twrIndex: p.twrIndex / base }))
}
