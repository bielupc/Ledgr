import { useCallback, useMemo, type ReactNode } from 'react'
import { RefreshCw, TrendingUp } from 'lucide-react'
import type { EChartsOption } from 'echarts'
import { Chart } from '@/components/charts/Chart'
import { Money } from '@/components/brand/Money'
import { EmptyState } from '@/components/empty/EmptyState'
import { GridMarkPulse } from '@/components/brand/GridMark'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ImportOrdersButton } from '@/features/investments/ImportOrdersButton'
import { usePortfolioSeries, usePortfolioSummary, useRefreshPrices } from '@/features/investments/hooks'
import { RANGES, sliceRange, type Range } from '@/features/investments/range'
import { useParamState } from '@/hooks/useParamState'
import { formatEuro, formatFullDay } from '@/lib/format'
import type { Tokens } from '@/lib/charts'
import { cn } from '@/lib/utils'
import { maxDrawdownPercent, sharpeRatio, windowedGain } from '@shared/portfolioStats'

/** Relative "synced Xm/h ago", short enough for a footer line. */
function relativeSync(iso: string | null): string | null {
  if (!iso) return null
  const then = Date.parse(`${iso.replace(' ', 'T')}Z`)
  const minutes = Math.round((Date.now() - then) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

export function PortfolioHero() {
  const summary = usePortfolioSummary()
  const series = usePortfolioSeries()
  const refresh = useRefreshPrices()
  const [range, setRange] = useParamState<Range>('range', 'All', RANGES)

  const points = useMemo(() => sliceRange(series.data ?? [], range), [series.data, range])

  const kpis = useMemo(
    () => ({
      gain: windowedGain(points),
      drawdown: maxDrawdownPercent(points),
      sharpe: sharpeRatio(points),
    }),
    [points],
  )

  const build = useCallback(
    (tokens: Tokens): EChartsOption => ({
      grid: { top: 8, right: 0, bottom: 0, left: 0 },
      xAxis: {
        type: 'category',
        data: points.map((p) => p.date),
        show: false,
        boundaryGap: false,
      },
      yAxis: [
        {
          type: 'value',
          show: false,
          min: (value: { min: number; max: number }) =>
            Math.min(value.min, 0) - (value.max - Math.min(value.min, 0)) * 0.35 - 1,
        },
      ],
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'line',
          lineStyle: { color: tokens['--chart-axis'], width: 1, type: 'dashed' },
        },
        formatter: (params: unknown) => {
          const list = params as { dataIndex: number }[]
          const point = points[list[0]?.dataIndex ?? 0]
          if (!point) return ''
          return `<div style="font-size:11px;opacity:.7">${formatFullDay(point.date)}</div>
            <div style="font-family:'DM Mono',monospace;margin-top:2px">${formatEuro(point.valueCents)}</div>`
        },
      },
      series: [
        {
          type: 'line',
          data: points.map((p) => p.valueCents),
          smooth: 0.28,
          symbol: 'none',
          lineStyle: { width: 2, color: tokens['--chart-4'] },
          areaStyle: { opacity: 0.14, color: tokens['--chart-4'] },
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

  const data = summary.data
  const hasHoldings = Boolean(data && (data.valueCents > 0 || data.contributedCents !== 0))

  if (!hasHoldings) {
    return (
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card">
        <EmptyState
          icon={TrendingUp}
          title="Import your MyInvestor orders"
          description="Upload the orders export from MyInvestor to see your holdings, allocation and performance."
        >
          <ImportOrdersButton />
        </EmptyState>
      </section>
    )
  }

  const hasHistory = points.length > 1

  return (
    <section className="relative isolate overflow-hidden rounded-2xl border border-border bg-card">
      <div className="relative overflow-hidden">
        {hasHistory && (
          <div className="absolute inset-y-0 right-0 hidden w-[70%] lg:block [mask-image:linear-gradient(to_right,transparent_0%,black_12%)]">
            <Chart build={build} height="100%" />
          </div>
        )}

        <div className="relative z-10 flex w-full flex-col gap-2 px-5 py-5 lg:min-h-[152px] lg:w-[30%] lg:min-w-[360px] lg:px-6">
          <div className="flex items-start justify-between gap-2">
            <span className="label-mono">Portfolio value</span>
            <div className="flex items-center gap-1.5">
              <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
                <TabsList variant="line" className="h-6 gap-2.5 p-0">
                  {RANGES.map((r) => (
                    <TabsTrigger key={r} value={r} className="h-6 px-0 text-[11px]">
                      {r}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                disabled={refresh.isPending}
                onClick={() => refresh.mutate()}
                aria-label="Refresh prices"
                title={data?.syncedAt ? `Synced ${relativeSync(data.syncedAt)}` : undefined}
              >
                <RefreshCw
                  className={cn('size-3.5', refresh.isPending && 'animate-spin')}
                  strokeWidth={1.75}
                />
              </Button>
            </div>
          </div>

          <Money
            cents={data?.valueCents ?? 0}
            animate
            className="money-hero display-tight text-[40px] leading-none"
          />

          <div className="flex items-baseline gap-1 text-[12.5px] text-subtle-foreground">
            <Money cents={data?.dayChangeCents ?? 0} signed tone="auto" spaced={false} className="tabular" />
            <span>today</span>
          </div>
        </div>

        {hasHistory && (
          <div className="h-[104px] w-full lg:hidden">
            <Chart build={build} height="100%" />
          </div>
        )}
      </div>

      {hasHistory && (
        <div className="relative z-10 grid grid-cols-3 bg-background/70 shadow-[inset_0_1px_0_var(--bevel)]">
          <KpiStat
            label="Total gain"
            value={
              <span className="inline-flex flex-wrap items-baseline gap-x-1">
                <Money
                  cents={kpis.gain.gainCents}
                  signed
                  tone="auto"
                  spaced={false}
                  className="money-stat text-[13px] font-medium sm:text-[17px]"
                />
                {kpis.gain.gainPercent !== null && (
                  <span
                    className={cn(
                      'text-[11px] sm:text-[13px]',
                      kpis.gain.gainCents >= 0 ? 'text-positive' : 'text-negative',
                    )}
                  >
                    ({kpis.gain.gainCents >= 0 ? '+' : ''}
                    {kpis.gain.gainPercent.toFixed(1)}%)
                  </span>
                )}
              </span>
            }
          />
          <KpiStat
            label="Max drawdown"
            bordered
            value={
              <span
                className={cn(
                  'money-stat text-[13px] font-medium sm:text-[17px]',
                  kpis.drawdown && kpis.drawdown < 0 ? 'text-negative' : undefined,
                )}
              >
                {(kpis.drawdown === null || kpis.drawdown === 0 ? 0 : kpis.drawdown).toFixed(1)}%
              </span>
            }
          />
          <KpiStat
            label="Sharpe ratio"
            value={
              <span
                className={cn(
                  'money-stat text-[13px] font-medium sm:text-[17px]',
                  kpis.sharpe === null
                    ? undefined
                    : kpis.sharpe >= 0
                      ? 'text-positive'
                      : 'text-negative',
                )}
              >
                {kpis.sharpe === null ? '—' : kpis.sharpe.toFixed(2)}
              </span>
            }
          />
        </div>
      )}
    </section>
  )
}

function KpiStat({ label, value, bordered }: { label: string; value: ReactNode; bordered?: boolean }) {
  return (
    <div
      className={cn(
        'group relative px-3 py-2.5 transition-colors duration-150 ease-[var(--ease-out-brand)] sm:px-6 sm:py-3 hoverfine:bg-card/50',
        bordered && 'border-x border-border',
      )}
    >
      <span className="label-mono transition-colors duration-150 group-hoverfine:text-muted-foreground">
        {label}
      </span>
      <div className="mt-1">{value}</div>
    </div>
  )
}
