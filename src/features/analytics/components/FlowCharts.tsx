import { useCallback, useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { ArrowDownRight, ArrowUpRight, Scale } from 'lucide-react'
import { Chart } from '@/components/charts/Chart'
import { Panel, PanelLoading } from '@/components/charts/Panel'
import { EmptyState } from '@/components/empty/EmptyState'
import { useMonthlyTotals } from '@/features/analytics/hooks'
import { useQuickActions } from '@/features/quick-actions/QuickActions'
import {
  ANIMATION,
  categoryAxis,
  moneyAxis,
  tooltipRow,
  withAlpha,
  type Tokens,
} from '@/lib/charts'
import { formatCompactAmount, formatMonthLabel, formatMonthShort } from '@/lib/format'

const MONTHS = 8

function dot(color: string) {
  return `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${color}"></span>`
}

/*
 * Income and expense get a card each rather than a shared axis: read side by
 * side they still compare, and neither series has to survive being drawn at the
 * other's scale. One series per card also means no legend — the title names it.
 */
export function FlowChart({ month, kind }: { month: string; kind: 'income' | 'expense' }) {
  const totals = useMonthlyTotals(month, MONTHS)
  const { openTransaction } = useQuickActions()
  const data = useMemo(() => totals.data ?? [], [totals.data])

  const values = useMemo(
    () => data.map((d) => (kind === 'income' ? d.incomeCents : d.expenseCents)),
    [data, kind],
  )
  const hasData = values.some((value) => value > 0)

  const build = useCallback(
    (tokens: Tokens, reducedMotion: boolean): EChartsOption => {
      const line = kind === 'income' ? tokens['--chart-1']! : tokens['--chart-5']!

      return {
        // Room at the top for the point labels, which sit above the marks.
        grid: { top: 28, right: 26, bottom: 22, left: 26 },
        xAxis: categoryAxis(
          tokens,
          data.map((d) => formatMonthShort(d.month)),
        ),
        // Every point carries its own figure, so axis ticks would only repeat
        // the annotation; the split lines alone give the scale.
        yAxis: { ...moneyAxis(tokens), axisLabel: { show: false } },
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'line', lineStyle: { color: tokens['--chart-axis'], width: 1 } },
          formatter: (params: unknown) => {
            const list = params as { dataIndex: number }[]
            const index = list[0]?.dataIndex ?? 0
            const row = data[index]
            if (!row) return ''
            return `<div style="font-size:11px;opacity:.7">${formatMonthLabel(row.month)}</div>
              ${tooltipRow(dot(line), kind === 'income' ? 'Income' : 'Expense', values[index] ?? 0)}`
          },
        },
        series: [
          {
            type: 'line',
            data: values,
            lineStyle: { color: line, width: 2 },
            itemStyle: { color: line, borderColor: tokens['--card'], borderWidth: 2 },
            symbol: 'circle',
            symbolSize: 8,
            showSymbol: true,
            areaStyle: {
              color: {
                type: 'linear',
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: withAlpha(line, 0.22) },
                  { offset: 1, color: withAlpha(line, 0) },
                ],
              },
            },
            label: {
              show: true,
              position: 'top',
              distance: 7,
              color: tokens['--muted-foreground'],
              fontFamily: "'DM Mono', ui-monospace, monospace",
              fontSize: 10,
              formatter: (params: { value: unknown }) => formatCompactAmount(Number(params.value)),
            },
            labelLayout: { hideOverlap: true },
            emphasis: { scale: 1.4, focus: 'none' },
            animationDuration: ANIMATION.duration,
            animationEasing: ANIMATION.easing,
            animationDelay: reducedMotion ? 0 : ANIMATION.delay,
          },
        ],
      }
    },
    [data, values, kind],
  )

  const income = kind === 'income'
  const title = income ? 'Income' : 'Expenses'

  return (
    <Panel title={title}>
      {totals.isLoading ? (
        <PanelLoading height={224} />
      ) : hasData ? (
        <Chart build={build} height={224} />
      ) : (
        <EmptyState
          icon={income ? ArrowUpRight : ArrowDownRight}
          title={income ? 'No income yet' : 'No expenses yet'}
          description={
            income
              ? 'Record what comes in and the monthly trend is drawn here, eight months at a time.'
              : 'Record what goes out and the monthly trend is drawn here, eight months at a time.'
          }
          actionLabel={income ? 'Add income' : 'Add an expense'}
          onAction={() => openTransaction(kind)}
          size="sm"
        />
      )}
    </Panel>
  )
}

/** Balance is income − expense. Sign reads from which side of the axis a bar
 *  falls, not from colour — green/red are reserved for income/expense
 *  elsewhere, so the bar itself just takes the theme's ink (white on dark,
 *  black on light). */
export function BalanceChart({ month }: { month: string }) {
  const totals = useMonthlyTotals(month, MONTHS)
  const data = useMemo(() => totals.data ?? [], [totals.data])
  const hasData = data.some((d) => d.incomeCents > 0 || d.expenseCents > 0)

  const build = useCallback(
    (tokens: Tokens): EChartsOption => ({
      grid: { top: 28, right: 20, bottom: 22, left: 20 },
      xAxis: categoryAxis(
        tokens,
        data.map((d) => formatMonthShort(d.month)),
      ),
      yAxis: { ...moneyAxis(tokens), axisLabel: { show: false } },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow', shadowStyle: { color: tokens['--muted'] } },
        formatter: (params: unknown) => {
          const list = params as { dataIndex: number }[]
          const index = list[0]?.dataIndex ?? 0
          const row = data[index]
          if (!row) return ''
          return `<div style="font-size:11px;opacity:.7">${formatMonthLabel(row.month)}</div>
            ${tooltipRow(dot(tokens['--foreground']!), 'Balance', row.balanceCents)}`
        },
      },
      series: [
        {
          type: 'bar',
          data: data.map((d) => ({
            value: d.balanceCents,
            itemStyle: {
              color: tokens['--foreground'],
              borderRadius: d.balanceCents >= 0 ? [4, 4, 0, 0] : [0, 0, 4, 4],
            },
            // A deficit bar hangs below the axis, so its figure has to sit under
            // it rather than on top of the axis line.
            label: { position: d.balanceCents >= 0 ? 'top' : 'bottom' },
          })),
          label: {
            show: true,
            distance: 6,
            color: tokens['--muted-foreground'],
            fontFamily: "'DM Mono', ui-monospace, monospace",
            fontSize: 10,
            formatter: (params: { value: unknown }) => formatCompactAmount(Number(params.value)),
          },
          labelLayout: { hideOverlap: true },
          barMaxWidth: 18,
        },
      ],
    }),
    [data],
  )

  return (
    <Panel title="Balance">
      {totals.isLoading ? (
        <PanelLoading height={224} />
      ) : hasData ? (
        <Chart build={build} height={224} />
      ) : (
        <EmptyState
          icon={Scale}
          title="Nothing to balance yet"
          description="Your monthly surplus or deficit shows up here as soon as there are entries on both sides."
          size="sm"
        />
      )}
    </Panel>
  )
}
