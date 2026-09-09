import { Plus, Target } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Panel, PanelLoading } from '@/components/charts/Panel'
import { PanelAction } from '@/components/charts/PanelAction'
import { EmptyState } from '@/components/empty/EmptyState'
import { CellMeter } from '@/components/brand/CellMeter'
import { Money } from '@/components/brand/Money'
import { useBudgetStatus } from '@/features/analytics/hooks'
import { resolveIcon } from '@/lib/icons'
import { percent } from '@/lib/format'
import { cn } from '@/lib/utils'

export function BudgetPanel({ month }: { month: string }) {
  const budgets = useBudgetStatus(month)
  const navigate = useNavigate()

  const rows = budgets.data ?? []

  return (
    <Panel title="Budgets">
      {budgets.isLoading ? (
        <PanelLoading height={220} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No budgets set"
          description=""
          actionLabel="Set a budget"
          onAction={() => void navigate('/budgets')}
          size="sm"
        />
      ) : (
        <>
          <ul className="flex flex-col px-1 pb-1">
          {rows.map((row, index) => {
            const Icon = resolveIcon(row.categoryIcon)
            const used = percent(row.spentCents, row.budgetCents)
            const over = row.spentCents > row.budgetCents
            const remaining = row.budgetCents - row.spentCents

            return (
              <li
                key={row.categoryId}
                className="group flex flex-col gap-1.5 rounded-lg px-2 py-2 transition-colors duration-150 ease-[var(--ease-out-brand)] hoverfine:bg-muted/60"
              >
                <div className="flex items-baseline gap-2.5">
                  <Icon
                    className={cn(
                      'size-3.5 shrink-0 self-center transition-[color,scale] duration-150 ease-[var(--ease-out-brand)] group-hoverfine:scale-110',
                      over
                        ? 'text-negative'
                        : 'text-muted-foreground group-hoverfine:text-accent-ink',
                    )}
                    strokeWidth={1.75}
                  />
                  {/* Breaching a budget is the only actionable state in this
                      panel, so it is the only one that raises its voice. */}
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate text-[13px]',
                      over && 'font-semibold',
                    )}
                  >
                    {row.categoryName}
                  </span>
                  <span
                    className={cn(
                      'tabular shrink-0 text-[14px]',
                      over ? 'font-semibold text-negative' : 'text-muted-foreground',
                    )}
                  >
                    {used}%
                  </span>
                </div>

                <div className="flex items-center gap-2.5">
                  <CellMeter
                    fraction={over ? 1 : row.spentCents / row.budgetCents}
                    tone={over ? 'negative' : 'emerald'}
                    delayMs={index * 40}
                  />
                  <span className="tabular flex-1 truncate text-[11px] text-subtle-foreground">
                    <Money cents={row.spentCents} className="text-[11px]" /> of{' '}
                    <Money cents={row.budgetCents} className="text-[11px]" />
                  </span>
                  <span
                    className={cn(
                      'tabular shrink-0 text-[11px]',
                      over ? 'font-medium text-negative' : 'text-subtle-foreground',
                    )}
                  >
                    {over ? (
                      <>
                        <Money cents={-remaining} className="text-[11px]" /> over
                      </>
                    ) : (
                      <>
                        <Money cents={remaining} className="text-[11px]" /> left
                      </>
                    )}
                  </span>
                </div>
              </li>
            )
            })}
          </ul>

          <PanelAction
            icon={Plus}
            label="Set a budget"
            onClick={() => void navigate('/budgets')}
          />
        </>
      )}
    </Panel>
  )
}
