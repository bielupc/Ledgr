import { useCallback, useMemo } from 'react'
import { ArrowDownRight, ArrowUpRight, Wallet } from 'lucide-react'
import type { EChartsOption } from 'echarts'
import { Chart } from '@/components/charts/Chart'
import { Money } from '@/components/brand/Money'
import { EmptyState } from '@/components/empty/EmptyState'
import { GridMarkPulse } from '@/components/brand/GridMark'
import { useNetWorthSeries, useSummary } from '@/features/analytics/hooks'
import { useQuickActions } from '@/features/quick-actions/QuickActions'
import {
  currentMonth,
  formatEuro,
  formatMonthLabel,
  formatMonthLong,
  formatPercentChange,
} from '@/lib/format'
import type { Tokens } from '@/lib/charts'
import { cn } from '@/lib/utils'

export function NetWorthHero({ month }: { month: string }) {
  const summary = useSummary(month)
  const series = useNetWorthSeries()
  const { openAccount } = useQuickActions()

  const points = useMemo(() => series.data ?? [], [series.data])

  const build = useCallback(
    (tokens: Tokens): EChartsOption => ({
      grid: { top: 8, right: 0, bottom: 0, left: 0 },
      xAxis: {
        type: 'category',
        data: points.map((p) => p.capturedOn.slice(0, 7)),
        show: false,
        boundaryGap: false,
      },
      yAxis: {
        type: 'value',
        show: false,
        min: (value: { min: number; max: number }) =>
          value.min - (value.max - value.min) * 0.35 - 1,
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'line',
          lineStyle: { color: tokens['--chart-axis'], width: 1, type: 'dashed' },
        },
        formatter: (params: unknown) => {
          const list = params as { dataIndex: number; value: number }[]
          const first = list[0]
          if (!first) return ''
          const point = points[first.dataIndex]
          if (!point) return ''
          return `<div style="font-size:11px;opacity:.7">${formatMonthLabel(
            point.capturedOn.slice(0, 7),
          )}</div><div style="font-family:'DM Mono',monospace;margin-top:2px">${formatEuro(
            point.amountCents,
          )}</div>`
        },
      },
      series: [
        {
          type: 'line',
          data: points.map((p) => p.amountCents),
          smooth: 0.32,
          symbol: 'circle',
          symbolSize: 8,
          showSymbol: false,
          lineStyle: { width: 2, color: tokens['--chart-4'] },
          itemStyle: { color: tokens['--chart-4'], borderWidth: 2 },
          areaStyle: {
            opacity: 0.14,
            color: tokens['--chart-4'],
          },
        },
      ],
    }),
    [points],
  )

  if (summary.isLoading) {
    return (
      <section className="relative flex h-[196px] items-center justify-center overflow-hidden rounded-2xl border border-border bg-card">
        <GridMarkPulse size={26} className="text-muted-foreground" />
      </section>
    )
  }

  const netWorth = summary.data?.netWorthCents ?? 0
  const previous = summary.data?.previousNetWorthCents ?? null
  const delta = previous === null ? null : netWorth - previous
  const changePercent = previous === null ? null : formatPercentChange(netWorth, previous)
  const hasHistory = points.length > 1

  if (netWorth === 0 && points.length === 0) {
    return (
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card">
        <EmptyState
          icon={Wallet}
          title="Your net worth starts with an account"
          description="Add the accounts you actually hold — a current account, savings, cash. Balances roll up here and get snapshotted every month."
          actionLabel="Add your first account"
          onAction={openAccount}
        />
      </section>
    )
  }

  return (
    <section className="relative isolate overflow-hidden rounded-2xl border border-border bg-card">
      {/* The upper plane. Clipped, so the trend fills it to the stat row and
          stops there: running the plot through the figures put the axis pointer
          across the labels and the tooltip on top of them. */}
      <div className="relative overflow-hidden">
        {/* The trend is the card's material, starting where the figure ends
            rather than sitting beside it as a second widget. */}
        {hasHistory && (
          <div className="absolute inset-y-0 right-0 hidden w-[70%] sm:block [mask-image:linear-gradient(to_right,transparent_0%,black_12%)]">
            <Chart build={build} height="100%" />
          </div>
        )}

        <div className="relative z-10 flex min-h-[152px] w-[30%] min-w-[340px] flex-col gap-0 px-6 py-5">
        {/* Stated as of the viewed month, while the Balances panel below is
            always current. Say which, or the two totals look contradictory. */}
        <span className="label-mono">
          Net worth{month === currentMonth() ? '' : ` · end of ${formatMonthLong(month)}`}
        </span>

        <Money
          cents={netWorth}
          animate
          className="money-hero display-tight text-[46px] leading-none"
        />

        {delta !== null && changePercent !== null && (
          <div className="flex items-center gap-1.5 text-[12.5px]">
            {delta >= 0 ? (
              <ArrowUpRight className="size-3.5 text-positive" strokeWidth={2.25} />
            ) : (
              <ArrowDownRight className="size-3.5 text-negative" strokeWidth={2.25} />
            )}
            <span
              className={cn(
                'tabular',
                delta > 0 ? 'text-positive' : delta < 0 ? 'text-negative' : '',
              )}
            >
              {changePercent}
            </span>
          </div>
        )}

        {!hasHistory && (
          <p className="max-w-[34ch] text-[12px] leading-relaxed text-subtle-foreground">
            One month recorded so far. The trend line appears from the next snapshot.
          </p>
        )}
        </div>
      </div>

      {/* Recessed plane: darker ground and a 1px inset bevel where it drops
          away from the plane above. */}
      <div className="relative z-10 grid grid-cols-3 bg-background/70 shadow-[inset_0_1px_0_var(--bevel)]">
        <Stat label="Income" cents={summary.data?.monthIncomeCents ?? 0} tone="positive" />
        <Stat
          label="Expense"
          cents={summary.data?.monthExpenseCents ?? 0}
          tone="negative"
          bordered
        />
        <Stat label="Balance" cents={summary.data?.monthBalanceCents ?? 0} tone="auto" />
      </div>
    </section>
  )
}

function Stat({
  label,
  cents,
  tone,
  bordered,
}: {
  label: string
  cents: number
  tone: 'positive' | 'negative' | 'auto'
  bordered?: boolean
}) {
  return (
    <div
      className={cn(
        'group relative px-6 py-3 transition-colors duration-150 ease-[var(--ease-out-brand)] hoverfine:bg-card/50',
        bordered && 'border-x border-border',
      )}
    >
      <span className="label-mono transition-colors duration-150 group-hoverfine:text-muted-foreground">
        {label}
      </span>
      <div className="mt-1">
        <Money cents={cents} tone={tone} animate className="text-[17px] font-medium" />
      </div>
    </div>
  )
}
