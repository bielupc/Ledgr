import { useCallback, useMemo, useState } from 'react'
import type { EChartsOption } from 'echarts'
import { CandlestickChart } from 'lucide-react'
import { Chart } from '@/components/charts/Chart'
import { Panel, PanelLoading } from '@/components/charts/Panel'
import { EmptyState } from '@/components/empty/EmptyState'
import { Money } from '@/components/brand/Money'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useFunds, useFundPrices, useHoldings } from '@/features/investments/hooks'
import { fundLabel, formatSignedPercent } from '@/features/investments/format'
import { formatEuro, formatFullDay } from '@/lib/format'
import type { Tokens } from '@/lib/charts'
import type { Holding } from '@shared/types.ts'
import { cn } from '@/lib/utils'

/**
 * The list is the picker: a held asset's own value and gain are what decide
 * which one to look at next, so they sit beside the name rather than behind
 * a dropdown that hides them until opened. Closed assets carry no live
 * position and are looked at far less often, so they fold into a compact
 * dropdown beneath the list instead of matching it row for row — two
 * populations, the same way Budgets keeps budgeted and unbudgeted apart.
 */
function HoldingRow({
  holding,
  active,
  onSelect,
}: {
  holding: Holding
  active: boolean
  onSelect: () => void
}) {
  const gainPositive = holding.gainCents >= 0

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-[background-color,border-color] duration-150 ease-[var(--ease-out-brand)]',
        active
          ? 'border-emerald/45 bg-emerald/10'
          : 'border-transparent hoverfine:border-border hoverfine:bg-muted/60',
      )}
    >
      <span className="min-w-0 flex-1 truncate text-[13px]">{fundLabel(holding)}</span>
      <span className="flex shrink-0 flex-col items-end gap-0.5">
        <Money cents={holding.valueCents} className="text-[12.5px]" />
        {holding.gainPercent !== null && (
          <span className={cn('tabular text-[11px]', gainPositive ? 'text-positive' : 'text-negative')}>
            {formatSignedPercent(holding.gainPercent)}
          </span>
        )}
      </span>
    </button>
  )
}

export function FundChart() {
  const funds = useFunds()
  const holdings = useHoldings()
  const [isin, setIsin] = useState<string | null>(null)
  const activeIsin = isin ?? holdings.data?.[0]?.isin ?? funds.data?.[0]?.isin ?? null
  const series = useFundPrices(activeIsin)

  const held = new Set((holdings.data ?? []).map((h) => h.isin))
  const closedFunds = (funds.data ?? []).filter((f) => !held.has(f.isin))
  const activeFund = funds.data?.find((f) => f.isin === activeIsin)

  const prices = useMemo(() => series.data?.prices ?? [], [series.data])
  const orders = useMemo(() => series.data?.orders ?? [], [series.data])

  const first = prices[0]
  const last = prices[prices.length - 1]
  const changePercent =
    first && last && first.navMicros > 0 ? ((last.navMicros - first.navMicros) / first.navMicros) * 100 : null

  const build = useCallback(
    (tokens: Tokens): EChartsOption => {
      const positive = (changePercent ?? 0) >= 0
      const line = positive ? tokens['--positive']! : tokens['--negative']!
      const values = prices.map((p) => p.navMicros / 1_000_000)
      const dateIndex = new Map(prices.map((p, i) => [p.pricedOn, i]))

      // Marked at the line's own value for that day, not the order's own
      // execution NAV — the two can differ by a cent or two (broker cutoff
      // vs. the day's official close), which is what made a marker float a
      // hair off the curve instead of sitting on it.
      const markerPoints = (
        name: string,
        kinds: readonly string[],
        color: string,
        rotate: number,
        offset: number,
      ) =>
        orders
          .filter((o) => kinds.includes(o.kind))
          .map((o) => dateIndex.get(o.tradedOn))
          .filter((i): i is number => i !== undefined)
          .map((i) => ({
            name,
            coord: [i, values[i]!],
            symbolRotate: rotate,
            symbolOffset: [0, offset],
            itemStyle: { color, borderColor: tokens['--card'], borderWidth: 1.5 },
          }))

      return {
        grid: { top: 24, right: 12, bottom: 24, left: 8 },
        xAxis: {
          type: 'category',
          data: prices.map((p) => p.pricedOn),
          axisLine: { lineStyle: { color: tokens['--chart-grid'] } },
          axisTick: { show: false },
          axisLabel: {
            color: tokens['--muted-foreground'],
            fontSize: 10,
            fontFamily: "'DM Mono', ui-monospace, monospace",
            formatter: (value: string) => formatFullDay(value).replace(/\s\d{4}$/, ''),
          },
        },
        yAxis: { type: 'value', scale: true, show: false },
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'line', lineStyle: { color: tokens['--chart-axis'], width: 1 } },
          formatter: (params: unknown) => {
            const list = params as { dataIndex: number }[]
            const index = list[0]?.dataIndex ?? 0
            const point = prices[index]
            if (!point) return ''
            return `<div style="font-size:11px;opacity:.7">${formatFullDay(point.pricedOn)}</div>
              <div style="font-family:'DM Mono',monospace;margin-top:2px">${formatEuro(Math.round((point.navMicros / 1_000_000) * 100))}</div>`
          },
        },
        series: [
          {
            type: 'line',
            data: values,
            smooth: 0.24,
            symbol: 'none',
            lineStyle: { width: 2, color: line },
            areaStyle: { opacity: 0.1, color: line },
            markPoint: {
              symbol: 'triangle',
              symbolSize: 11,
              silent: true,
              label: { show: false },
              data: [
                ...markerPoints('Buy', ['buy', 'transferIn'], tokens['--chart-cat-1']!, 0, -9),
                ...markerPoints('Sell', ['sell', 'transferOut'], tokens['--chart-cat-2']!, 180, 9),
              ],
            },
          },
        ],
      }
    },
    [prices, orders, changePercent],
  )

  if (funds.isLoading || holdings.isLoading) {
    return (
      <Panel title="Asset price">
        <PanelLoading height={260} />
      </Panel>
    )
  }

  if ((funds.data ?? []).length === 0) {
    return (
      <Panel title="Asset price">
        <EmptyState icon={CandlestickChart} title="No assets yet" description="" size="sm" />
      </Panel>
    )
  }

  const heldRows = holdings.data ?? []
  const activeClosedIsin = activeIsin && closedFunds.some((f) => f.isin === activeIsin) ? activeIsin : undefined

  return (
    <Panel title="Asset price">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
        <div className="flex shrink-0 flex-col gap-2 lg:w-[33%]">
          <ul className="flex flex-col gap-1">
            {heldRows.map((h) => (
              <li key={h.isin}>
                <HoldingRow holding={h} active={h.isin === activeIsin} onSelect={() => setIsin(h.isin)} />
              </li>
            ))}
          </ul>

          {closedFunds.length > 0 && (
            <Select value={activeClosedIsin} onValueChange={setIsin}>
              <SelectTrigger size="sm" className="w-full text-subtle-foreground">
                <SelectValue placeholder={`Closed (${closedFunds.length})`} />
              </SelectTrigger>
              <SelectContent>
                {closedFunds.map((f) => (
                  <SelectItem key={f.isin} value={f.isin}>
                    {fundLabel(f)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          {series.isLoading ? (
            <PanelLoading height={260} />
          ) : prices.length === 0 ? (
            <EmptyState
              icon={CandlestickChart}
              title="No prices yet"
              description="Prices for this asset haven't synced yet — check back shortly."
              size="sm"
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-2 pt-1 pb-2">
                <div className="flex flex-col">
                  <span className="label-mono">Price</span>
                  <Money
                    cents={Math.round(((last?.navMicros ?? 0) / 1_000_000) * 100)}
                    className="text-[15px]"
                  />
                </div>
                {changePercent !== null && (
                  <div className="flex flex-col">
                    <span className="label-mono">Over this range</span>
                    <span
                      className={cn(
                        'tabular text-[15px]',
                        changePercent >= 0 ? 'text-positive' : 'text-negative',
                      )}
                    >
                      {formatSignedPercent(changePercent)}
                    </span>
                  </div>
                )}
                {activeFund && !activeFund.ftXid && (
                  <span className="text-[11px] text-subtle-foreground">Prices from your orders</span>
                )}
              </div>
              {/* Fills whatever height the row's tallest column settles on
                  (the holdings list, once it has more than a few rows) —
                  min-height is the floor for a short list, not a fixed size. */}
              <div className="min-h-[240px] flex-1">
                <Chart build={build} height="100%" />
              </div>
            </>
          )}
        </div>
      </div>
    </Panel>
  )
}
