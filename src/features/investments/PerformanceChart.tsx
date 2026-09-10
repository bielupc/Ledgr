import { useCallback, useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { LineChart } from 'lucide-react'
import { Chart } from '@/components/charts/Chart'
import { Panel, PanelLoading } from '@/components/charts/Panel'
import { EmptyState } from '@/components/empty/EmptyState'
import { usePortfolioSeries } from '@/features/investments/hooks'
import { formatSignedPercent } from '@/features/investments/format'
import { sliceRange, type Range } from '@/features/investments/range'
import { useParamState } from '@/hooks/useParamState'
import { RANGES } from '@/features/investments/range'
import { formatFullDay } from '@/lib/format'
import type { Tokens } from '@/lib/charts'

/** Cumulative time-weighted return over the selected range, rebased to 0% at
 *  the range's own start — see `sliceRange`. Reads the same `range` URL
 *  param as `PortfolioHero`, so the two stay in sync without extra state. */
export function PerformanceChart() {
  const series = usePortfolioSeries()
  const [range] = useParamState<Range>('range', 'All', RANGES)

  const points = useMemo(() => sliceRange(series.data ?? [], range), [series.data, range])
  const returns = useMemo(() => points.map((p) => (p.twrIndex - 1) * 100), [points])
  const latest = returns[returns.length - 1] ?? 0

  const build = useCallback(
    (tokens: Tokens): EChartsOption => {
      const positive = tokens['--positive']!
      const negative = tokens['--negative']!

      return {
        grid: { top: 12, right: 12, bottom: 20, left: 8 },
        xAxis: {
          type: 'category',
          data: points.map((p) => p.date),
          show: false,
          boundaryGap: false,
        },
        yAxis: {
          type: 'value',
          show: false,
          scale: true,
        },
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'line', lineStyle: { color: tokens['--chart-axis'], width: 1 } },
          formatter: (params: unknown) => {
            const list = params as { dataIndex: number }[]
            const index = list[0]?.dataIndex ?? 0
            const point = points[index]
            if (!point) return ''
            return `<div style="font-size:11px;opacity:.7">${formatFullDay(point.date)}</div>
              <div style="font-family:'DM Mono',monospace;margin-top:2px">${formatSignedPercent(returns[index] ?? 0)}</div>`
          },
        },
        // Colours the line/area per point rather than once for the whole
        // series, so a stretch that dips below zero reads red even when the
        // range ends positive (and vice versa).
        visualMap: {
          show: false,
          seriesIndex: 0,
          dimension: 1,
          // Bounds on both sides of each piece (rather than open-ended
          // `max`/`min` alone): the area's gradient fill needs a coordinate
          // for every stop, and an open end leaves one undefined.
          pieces: [
            { min: Math.min(-1, Math.min(...returns) - 1), max: 0, color: negative },
            { min: 0, max: Math.max(1, Math.max(...returns) + 1), color: positive },
          ],
        },
        series: [
          {
            type: 'line',
            data: returns,
            smooth: 0.24,
            symbol: 'none',
            lineStyle: { width: 2 },
            areaStyle: { opacity: 0.12 },
            markLine: {
              symbol: 'none',
              silent: true,
              lineStyle: { color: tokens['--chart-axis'], width: 1, type: 'dashed' },
              label: { show: false },
              data: [{ yAxis: 0 }],
            },
          },
        ],
      }
    },
    [points, returns],
  )

  if (series.isLoading) {
    return (
      <Panel title="Performance">
        <PanelLoading height={220} />
      </Panel>
    )
  }

  if (points.length < 2) {
    return (
      <Panel title="Performance">
        <EmptyState
          icon={LineChart}
          title="Not enough history yet"
          description="The performance line appears once there is more than one priced day."
          size="sm"
        />
      </Panel>
    )
  }

  return (
    <Panel
      title="Performance"
      action={
        <span className={`tabular text-[15px] ${latest >= 0 ? 'text-positive' : 'text-negative'}`}>
          {formatSignedPercent(latest)}
        </span>
      }
    >
      <Chart build={build} height={220} />
    </Panel>
  )
}
