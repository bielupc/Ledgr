import { useCallback, useMemo, useState } from 'react'
import type { EChartsOption } from 'echarts'
import { Chart } from '@/components/charts/Chart'
import { Money } from '@/components/brand/Money'
import { DynamicIcon } from '@/components/brand/DynamicIcon'
import { CATEGORICAL_SLOTS, categoricalPalette, type Tokens } from '@/lib/charts'
import { formatEuro, percent } from '@/lib/format'
import { cn } from '@/lib/utils'

/** However many hues the categorical palette actually has: past that the tail
 *  folds into one grey rather than inventing another. Derived, not a literal,
 *  because the slot count is a measured property of the palette. */
const HUES = CATEGORICAL_SLOTS

export interface ShareSlice {
  id: string
  name: string
  icon: string
  valueCents: number
}

interface SharePieProps {
  /** Already in the order they should read; the ring folds its own tail. */
  slices: ShareSlice[]
  /** Sits under the centre figure while nothing is hovered. */
  caption?: string
  /** Replaces the default amount cell at the end of each legend row. */
  renderTrailing?: (slice: ShareSlice) => React.ReactNode
  height?: number
  className?: string
}

/** The centre figure lives inside the ring's hole, so it steps down rather
 *  than overflowing once the amount runs long. */
function centreSize(cents: number): string {
  const length = formatEuro(cents).length
  if (length <= 10) return 'text-[20px]'
  if (length <= 13) return 'text-[17px]'
  return 'text-[14px]'
}

/*
 * A ring paired with its own legend, where the legend rows are the real
 * content and the ring is the proportion read. One component because three
 * surfaces need the same pairing, and the fold point and slot-colour rules
 * must not drift between them.
 */
export function SharePie({
  slices,
  caption = 'Total',
  renderTrailing,
  height = 228,
  className,
}: SharePieProps) {
  /* A hovered slice clears itself when the pointer leaves; a clicked or
     tapped one stays. Touch needs the distinction: one tap fires mouseover,
     click and mouseout together, so a single piece of state would light the
     slice up and clear it in the same gesture. */
  const [hovered, setHovered] = useState<number | null>(null)
  const [pinned, setPinned] = useState<number | null>(null)
  const active = pinned ?? hovered

  const totalCents = slices.reduce((sum, slice) => sum + slice.valueCents, 0)

  // How many rows get a hue of their own. The "Other" wedge wears
  // `--chart-other`, which is not one of the hues, so folding costs no slot and
  // every hue goes to a named row.
  const folded = slices.length > HUES
  const hueCount = Math.min(slices.length, HUES)
  const toneFor = (index: number) =>
    index < hueCount ? `var(--chart-cat-${index + 1})` : 'var(--chart-other)'

  const ring = useMemo(() => {
    if (!folded) return slices.map((slice) => ({ name: slice.name, value: slice.valueCents }))
    const tail = slices.slice(hueCount)
    return [
      ...slices.slice(0, hueCount).map((slice) => ({ name: slice.name, value: slice.valueCents })),
      {
        name: `Other (${tail.length})`,
        value: tail.reduce((sum, slice) => sum + slice.valueCents, 0),
      },
    ]
  }, [slices, folded, hueCount])

  const build = useCallback(
    (tokens: Tokens): EChartsOption => {
      const palette = categoricalPalette(tokens)
      return {
        grid: { top: 0, right: 0, bottom: 0, left: 0 },
        // No tooltip: hovering writes the slice into the ring's centre, and a
        // floating box would only occlude the figure it duplicates.
        tooltip: { show: false },
        series: [
          {
            type: 'pie',
            radius: ['62%', '90%'],
            center: ['50%', '50%'],
            avoidLabelOverlap: true,
            label: { show: false },
            labelLine: { show: false },
            // A surface-coloured ring separates adjacent slices instead of a
            // hairline that would read as another mark.
            itemStyle: { borderColor: tokens['--card'], borderWidth: 2, borderRadius: 3 },
            emphasis: { focus: 'self', scale: true, scaleSize: 5 },
            blur: { itemStyle: { opacity: 0.32 } },
            data: ring.map((slice, index) => ({
              name: slice.name,
              value: slice.value,
              itemStyle: {
                color:
                  index < hueCount
                    ? palette[index % palette.length]!
                    : tokens['--chart-other']!,
              },
            })),
          },
        ],
      }
    },
    [ring, hueCount],
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

  const focused = active === null ? null : ring[active]
  const centreCents = focused ? focused.value : totalCents
  const centreCaption = focused
    ? `${focused.name} · ${percent(focused.value, totalCents)}%`
    : caption

  return (
    <div
      className={cn(
        'flex flex-col items-center gap-4 p-3 lg:flex-row lg:items-center lg:gap-5',
        className,
      )}
    >
      <div className="relative w-[228px] shrink-0 lg:w-[36%]">
        <Chart build={build} height={height} onEvents={events} />

        {/* Held in HTML rather than an ECharts graphic so the figure keeps the
            brand's mono treatment and its dimmed decimals. */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="flex w-[130px] flex-col items-center gap-1 text-center">
            <Money
              cents={centreCents}
              animate
              className={cn('leading-none', centreSize(centreCents))}
            />
            <span className="label-mono max-w-full truncate">{centreCaption}</span>
          </div>
        </div>
      </div>

      {/* The legend is always present, so identity is icon, name and figure
          rather than colour alone. */}
      <ul className="flex w-full min-w-0 flex-1 flex-col">
        {slices.map((slice, index) => (
          <li
            key={slice.id}
            style={{ '--seg': toneFor(index) } as React.CSSProperties}
            className={cn(
              'group flex items-center gap-3 rounded-lg px-2 py-1.5 transition-[background-color,opacity] duration-150 ease-[var(--ease-out-brand)] hoverfine:bg-muted/60',
              // A folded row answers to the "Other" slice, which sits at the
              // end of the ring rather than at the row's own index.
              active !== null && Math.min(index, hueCount) !== active && 'opacity-40',
            )}
          >
            {/* The icon tile carries the slice's hue, so the legend swatch and
                the category's own mark are one object instead of two. */}
            <span className="grid size-8 shrink-0 place-items-center rounded-lg border transition-[scale] duration-150 ease-[var(--ease-out-brand)] group-hoverfine:scale-105 [background-color:color-mix(in_srgb,var(--seg)_12%,transparent)] [border-color:color-mix(in_srgb,var(--seg)_34%,transparent)]">
              <DynamicIcon name={slice.icon} className="size-4 [color:var(--seg)]" />
            </span>

            <span className="min-w-0 flex-1 truncate text-[13.5px]">{slice.name}</span>

            {/* The share is the one cell a phone can spare: the ring above
                already reads as proportion, while the name it was squeezing
                to "Groceri…" is the row's identity. */}
            <span className="tabular hidden w-9 shrink-0 text-right text-[11.5px] text-subtle-foreground sm:block">
              {percent(slice.valueCents, totalCents)}%
            </span>

            {renderTrailing ? (
              renderTrailing(slice)
            ) : (
              <Money cents={slice.valueCents} className="w-[104px] shrink-0 text-right text-[13px]" />
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
