import { useCallback, useMemo, useState } from 'react'
import type { EChartsOption } from 'echarts'
import { ChartPie } from 'lucide-react'
import { Chart } from '@/components/charts/Chart'
import { Panel, PanelLoading } from '@/components/charts/Panel'
import { EmptyState } from '@/components/empty/EmptyState'
import { Money } from '@/components/brand/Money'
import { useCategoryTotals } from '@/features/analytics/hooks'
import { useQuickActions } from '@/features/quick-actions/QuickActions'
import { CATEGORICAL_SLOTS, categoricalPalette, type Tokens } from '@/lib/charts'
import { formatEuro, percent } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { CategoryTotal } from '@shared/types.ts'

const MAX_SLICES = CATEGORICAL_SLOTS

const isOther = (row: CategoryTotal) =>
  row.categoryId === null && row.categoryName.startsWith('Other')

/** Same slot rule for the canvas and the HTML legend, so they cannot drift. */
const colorVar = (index: number, row: CategoryTotal) =>
  isOther(row) ? 'var(--chart-other)' : `var(--chart-cat-${(index % MAX_SLICES) + 1})`

/** Beyond the palette's slot count the tail folds into "Other" rather than
 *  inventing another hue. */
function foldTail(rows: CategoryTotal[]): CategoryTotal[] {
  if (rows.length <= MAX_SLICES) return rows
  // `MAX_SLICES` counts hues, not wedges: "Other" wears `--chart-other`, so it
  // is an extra wedge rather than one of the named slots.
  const head = rows.slice(0, MAX_SLICES)
  const tail = rows.slice(MAX_SLICES)
  return [
    ...head,
    {
      categoryId: null,
      categoryName: `Other (${tail.length})`,
      categoryIcon: 'circle-help',
      categoryColor: null,
      totalCents: tail.reduce((sum, row) => sum + row.totalCents, 0),
    },
  ]
}

/** The centre figure has to live inside the ring's hole, so it steps down
 *  rather than overflowing once the amount runs long. */
function centreSize(cents: number): string {
  const length = formatEuro(cents).length
  if (length <= 10) return 'text-[21px]'
  if (length <= 13) return 'text-[17px]'
  return 'text-[14px]'
}

export function CategoryDonut({
  month,
  kind,
}: {
  month: string
  kind: 'expense' | 'income'
}) {
  const totals = useCategoryTotals(month, kind)
  const { openTransaction } = useQuickActions()
  /* Hover is transient and a tap or click is not: a pointer leaving the ring
     takes its own highlight with it, while a chosen slice stays chosen. On a
     phone this is the whole mechanism — a tap fires mouseover, click and then
     mouseout in one go, so a single piece of state would light up and clear
     itself in the same gesture. */
  const [hovered, setHovered] = useState<number | null>(null)
  const [pinned, setPinned] = useState<number | null>(null)
  const active = pinned ?? hovered

  const rows = useMemo(() => foldTail(totals.data ?? []), [totals.data])
  const total = useMemo(() => rows.reduce((sum, row) => sum + row.totalCents, 0), [rows])

  const build = useCallback(
    (tokens: Tokens): EChartsOption => {
      const palette = categoricalPalette(tokens)
      const colorFor = (index: number, row: CategoryTotal) =>
        isOther(row) ? tokens['--chart-other']! : palette[index % palette.length]!

      return {
        grid: { top: 0, right: 0, bottom: 0, left: 0 },
        // No tooltip: hovering writes the slice into the ring's centre, and a
        // floating box would only occlude the figure it duplicates.
        tooltip: { show: false },
        series: [
          {
            type: 'pie',
            radius: ['64%', '90%'],
            center: ['50%', '50%'],
            avoidLabelOverlap: true,
            label: { show: false },
            labelLine: { show: false },
            // A surface-coloured ring separates adjacent slices instead of a
            // hairline that would read as another mark.
            itemStyle: { borderColor: tokens['--card'], borderWidth: 2, borderRadius: 3 },
            emphasis: { focus: 'self', scale: true, scaleSize: 5 },
            blur: { itemStyle: { opacity: 0.32 } },
            data: rows.map((row, index) => ({
              name: row.categoryName,
              value: row.totalCents,
              itemStyle: { color: colorFor(index, row) },
            })),
          },
        ],
      }
    },
    [rows],
  )

  const events = useMemo(
    () => ({
      mouseover: (params: never) => setHovered((params as { dataIndex: number }).dataIndex),
      mouseout: () => setHovered(null),
      globalout: () => setHovered(null),
      // Clicking the slice already chosen puts the total back.
      click: (params: never) => {
        const index = (params as { dataIndex: number }).dataIndex
        setPinned((current) => (current === index ? null : index))
      },
    }),
    [],
  )

  const title = kind === 'expense' ? 'Expenses' : 'Income'
  // "No expense this month" reads wrong; income is a mass noun, expenses is not.
  const plural = kind === 'expense' ? 'expenses' : 'income'

  if (totals.isLoading) {
    return (
      <Panel title={title}>
        <PanelLoading height={228} />
      </Panel>
    )
  }

  if (rows.length === 0) {
    return (
      <Panel title={title}>
        <EmptyState
          icon={ChartPie}
          title={`No ${plural} this month`}
          actionLabel={kind === 'expense' ? 'Add an expense' : 'Add income'}
          onAction={() => openTransaction(kind)}
          size="sm"
        />
      </Panel>
    )
  }

  const focused = active === null ? null : rows[active]
  const centreCents = focused ? focused.totalCents : total
  const centreCaption = focused
    ? `${focused.categoryName} · ${percent(focused.totalCents, total)}%`
    : 'Total'

  return (
    <Panel title={title}>
      <div className="flex items-center gap-3 px-2 pb-2">
        <div className="relative w-full sm:w-[46%] sm:shrink-0">
          <Chart build={build} height={204} onEvents={events} />

          {/* Held in HTML rather than an ECharts graphic so the figure keeps the
              brand's mono treatment and the dimmed decimals. */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="flex w-[124px] flex-col items-center gap-1 text-center">
              <Money
                cents={centreCents}
                animate
                className={cn('leading-none', centreSize(centreCents))}
              />
              <span className="label-mono max-w-full truncate">{centreCaption}</span>
            </div>
          </div>
        </div>

        {/* Legend from `sm` up, where identity never depends on colour alone.
            On a phone there is no width for it: the names truncate to
            "Groce…" and the figures repeat what the ring already shows. The
            ring keeps identity there by naming the slice you tap in its own
            centre, and the full list is a tap away on the Budgets screen. */}
        <ul className="hidden min-w-0 flex-1 flex-col gap-1.5 sm:flex">
          {rows.map((row, index) => (
            <li
              key={row.categoryId ?? row.categoryName}
              className={cn(
                'flex items-center gap-2 transition-opacity',
                active !== null && active !== index && 'opacity-40',
              )}
            >
              <span
                className="size-2 shrink-0 rounded-[2px]"
                style={{ background: colorVar(index, row) }}
              />
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted-foreground">
                {row.categoryName}
              </span>
              <span className="tabular shrink-0 text-[11px] text-subtle-foreground">
                {percent(row.totalCents, total)}%
              </span>
              <span className="tabular shrink-0 text-[12px]">
                {formatEuro(row.totalCents)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  )
}
