import { useState } from 'react'
import { PieChart } from 'lucide-react'
import { Panel, PanelLoading } from '@/components/charts/Panel'
import { EmptyState } from '@/components/empty/EmptyState'
import { Money } from '@/components/brand/Money'
import { ShareGrid } from '@/components/brand/ShareGrid'
import { useHoldings } from '@/features/investments/hooks'
import { fundLabel } from '@/features/investments/format'
import { allocateCells } from '@/lib/allocate'

/*
 * Fixed order, not ranked by size: a fund keeps its hue when the month's
 * performance re-sorts the rows. Drawn from the category-safe set — a fund is
 * an arbitrary identity here, not a sign, so red/blue/green stay reserved for
 * expense/net worth/income.
 */
const TONES = [
  'var(--chart-cat-1)',
  'var(--chart-cat-2)',
  'var(--chart-cat-3)',
  'var(--chart-cat-4)',
  'var(--chart-cat-5)',
]
const toneFor = (index: number) => TONES[index] ?? 'var(--chart-other)'

export function AllocationPanel() {
  const holdings = useHoldings()
  const [active, setActive] = useState<string | null>(null)

  const rows = holdings.data ?? []
  const ranked = [...rows].sort((a, b) => b.valueCents - a.valueCents)
  const tones = new Map(rows.map((h, index) => [h.isin, toneFor(index)]))

  const segments = ranked.map((h) => ({ id: h.isin, tone: tones.get(h.isin)!, value: h.valueCents }))
  const shares = allocateCells(
    segments.map((s) => s.value),
    100,
  )

  return (
    <Panel title="Allocation">
      {holdings.isLoading ? (
        <PanelLoading height={200} />
      ) : rows.length === 0 ? (
        <EmptyState icon={PieChart} title="No holdings yet" description="" size="sm" />
      ) : (
        <>
          <div className="px-2 pt-0.5 pb-3.5">
            <ShareGrid segments={segments} rows={4} columns={25} activeId={active} onActive={setActive} />
          </div>

          <ul className="flex flex-col px-1">
            {ranked.map((h, index) => (
              <li
                key={h.isin}
                onMouseEnter={() => setActive(h.isin)}
                onMouseLeave={() => setActive(null)}
                data-dim={(active !== null && active !== h.isin) || undefined}
                className="group flex items-center gap-3 rounded-lg px-2 py-[7px] transition-[background-color,opacity] duration-150 ease-[var(--ease-out-brand)] data-dim:opacity-45 hoverfine:bg-muted/60"
                style={{ '--seg': tones.get(h.isin) } as React.CSSProperties}
              >
                <span className="size-2.5 shrink-0 rounded-[2px] [background-color:var(--seg)]" />
                <span className="min-w-0 flex-1 truncate text-[13px]">{fundLabel(h)}</span>
                <span className="tabular w-9 shrink-0 text-right text-[11px] text-muted-foreground transition-colors duration-150 group-hoverfine:text-accent-ink">
                  {shares[index]}%
                </span>
                <Money cents={h.valueCents} className="w-[104px] shrink-0 text-right text-[13px]" />
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  )
}
