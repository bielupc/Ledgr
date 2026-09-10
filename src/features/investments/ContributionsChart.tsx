import { useCallback, useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { PiggyBank } from 'lucide-react'
import { Chart } from '@/components/charts/Chart'
import { Panel, PanelLoading } from '@/components/charts/Panel'
import { EmptyState } from '@/components/empty/EmptyState'
import { ImportOrdersButton } from '@/features/investments/ImportOrdersButton'
import { useContributions } from '@/features/investments/hooks'
import { ANIMATION, categoryAxis, moneyAxis, tooltipRow, type Tokens } from '@/lib/charts'
import { formatMonthLabel, formatMonthShort } from '@/lib/format'

const MONTHS = 12

function dot(color: string) {
  return `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${color}"></span>`
}

/** Monthly external contributions — buys above the axis, withdrawals below.
 *  Traspasos never appear here: they move cash between funds, not into or
 *  out of the portfolio (see `monthlyContributions` in `server/portfolio.ts`). */
export function ContributionsChart() {
  const contributions = useContributions()
  const data = useMemo(() => (contributions.data ?? []).slice(-MONTHS), [contributions.data])

  const build = useCallback(
    (tokens: Tokens, reducedMotion: boolean): EChartsOption => ({
      grid: { top: 12, right: 8, bottom: 22, left: 34 },
      xAxis: categoryAxis(
        tokens,
        data.map((d) => formatMonthShort(d.month)),
      ),
      yAxis: moneyAxis(tokens),
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: unknown) => {
          const list = params as { dataIndex: number }[]
          const index = list[0]?.dataIndex ?? 0
          const row = data[index]
          if (!row) return ''
          return `<div style="font-size:11px;opacity:.7">${formatMonthLabel(row.month)}</div>
            ${tooltipRow(dot(tokens['--positive']!), 'Bought', row.boughtCents)}
            ${row.soldCents > 0 ? tooltipRow(dot(tokens['--negative']!), 'Sold', row.soldCents) : ''}
            ${tooltipRow('', 'Net', row.netCents)}`
        },
      },
      series: [
        {
          type: 'bar',
          name: 'Bought',
          data: data.map((d) => d.boughtCents),
          itemStyle: { color: tokens['--positive'], borderRadius: [3, 3, 0, 0] },
          barMaxWidth: 22,
          animationDuration: ANIMATION.duration,
          animationEasing: ANIMATION.easing,
          animationDelay: reducedMotion ? 0 : ANIMATION.delay,
        },
        {
          type: 'bar',
          name: 'Sold',
          data: data.map((d) => -d.soldCents),
          itemStyle: { color: tokens['--negative'], borderRadius: [0, 0, 3, 3] },
          barMaxWidth: 22,
          animationDuration: ANIMATION.duration,
          animationEasing: ANIMATION.easing,
          animationDelay: reducedMotion ? 0 : ANIMATION.delay,
        },
      ],
    }),
    [data],
  )

  if (contributions.isLoading) {
    return (
      <Panel title="Monthly contributions">
        <PanelLoading height={220} />
      </Panel>
    )
  }

  const hasData = data.some((d) => d.boughtCents > 0 || d.soldCents > 0)

  if (!hasData) {
    return (
      <Panel title="Monthly contributions">
        <EmptyState icon={PiggyBank} title="No contributions yet" description="" size="sm">
          <ImportOrdersButton size="sm" />
        </EmptyState>
      </Panel>
    )
  }

  return (
    <Panel title="Monthly contributions">
      <Chart build={build} height={220} />
    </Panel>
  )
}
