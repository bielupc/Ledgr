import { useState } from 'react'
import { SlidersHorizontal, Target } from 'lucide-react'
import { Panel, PanelLoading } from '@/components/charts/Panel'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/empty/EmptyState'
import { Money } from '@/components/brand/Money'
import { CellMeter } from '@/components/brand/CellMeter'
import { useHoldings } from '@/features/investments/hooks'
import { TargetsDialog } from '@/features/investments/TargetsDialog'
import { fundLabel } from '@/features/investments/format'
import { cn } from '@/lib/utils'

/*
 * The same read as Budgets' spent-vs-limit: a target is a boundary, weight is
 * where the fund actually sits against it, and a cell run carries that
 * comparison pre-attentively — the same reason `<CellMeter>` exists rather
 * than a generic progress bar. One trailing figure (how much to move) is the
 * only number added beyond the weight itself; drift in percentage points and
 * a restated "of X%" said the same thing twice without it.
 */
export function TargetPanel() {
  const holdings = useHoldings()
  const [open, setOpen] = useState(false)

  const rows = holdings.data ?? []
  const anyTarget = rows.some((h) => h.targetBps > 0)

  return (
    <>
      <Panel
        title="Target vs actual"
        action={
          rows.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Edit targets"
              onClick={() => setOpen(true)}
            >
              <SlidersHorizontal className="size-3.5" strokeWidth={1.75} />
            </Button>
          )
        }
      >
        {holdings.isLoading ? (
          <PanelLoading height={200} />
        ) : rows.length === 0 ? (
          <EmptyState icon={Target} title="No holdings yet" description="" size="sm" />
        ) : !anyTarget ? (
          <EmptyState
            icon={Target}
            title="Set a target mix"
            description="Give each holding a target share of the portfolio to track drift against."
            actionLabel="Set targets"
            onAction={() => setOpen(true)}
            size="sm"
          />
        ) : (
          <ul className="flex flex-col gap-3 px-2 pt-1 pb-2">
            {rows.map((h, index) => {
              const hasTarget = h.targetBps > 0
              const over = h.weightBps > h.targetBps

              return (
                <li key={h.isin} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-[13px]">{fundLabel(h)}</span>
                    <span className="tabular shrink-0 text-[12px] text-muted-foreground">
                      {(h.weightBps / 100).toFixed(0)}%
                    </span>
                  </div>

                  {hasTarget ? (
                    <div className="flex items-center gap-2.5">
                      <CellMeter
                        fraction={h.targetBps > 0 ? h.weightBps / h.targetBps : 0}
                        tone={over ? 'negative' : 'emerald'}
                        delayMs={index * 40}
                        className="flex-1"
                      />
                      {h.toTargetCents !== 0 && (
                        <span
                          className={cn(
                            'tabular shrink-0 text-[11px]',
                            over ? 'text-negative' : 'text-subtle-foreground',
                          )}
                        >
                          <Money cents={Math.abs(h.toTargetCents)} className="text-[11px]" />{' '}
                          {over ? 'over' : 'under'}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-[11px] text-subtle-foreground">No target set</span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Panel>
      <TargetsDialog open={open} onClose={() => setOpen(false)} holdings={rows} />
    </>
  )
}
