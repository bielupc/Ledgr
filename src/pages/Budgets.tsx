import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { Plus, Target } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/empty/EmptyState'
import { PanelLoading } from '@/components/charts/Panel'
import { SharePie, type ShareSlice } from '@/components/charts/SharePie'
import { DynamicIcon } from '@/components/brand/DynamicIcon'
import { useCategories } from '@/features/categories/hooks'
import { useBudgetLimits } from '@/features/budgets/hooks'
import { BudgetDialog, type BudgetTarget } from '@/features/budgets/BudgetDialog'
import { useQuickActions } from '@/features/quick-actions/QuickActions'
import { formatEuro } from '@/lib/format'
import { fadeUp, stagger, transition } from '@/lib/motion'
import type { BudgetStatus, Category } from '@shared/types.ts'

const NO_CATEGORIES: Category[] = []
const NO_LIMITS: BudgetStatus[] = []

export default function Budgets() {
  const categories = useCategories({ kind: 'expense' })
  const limits = useBudgetLimits()
  const { openCategory } = useQuickActions()

  const [editing, setEditing] = useState<BudgetTarget | null>(null)

  const all = categories.data ?? NO_CATEGORIES
  const limitRows = limits.data ?? NO_LIMITS

  /* Two populations, not one list with holes: a category with a limit is a
     figure to read and adjust, one without is a candidate to pick. Ranked by
     the limit, so the ring reads from its largest slice around. */
  const budgeted = useMemo<ShareSlice[]>(() => {
    const byCategory = new Map(limitRows.map((row) => [row.categoryId, row.budgetCents]))
    return all
      .filter((category) => byCategory.has(category.id))
      .map((category) => ({
        id: category.id,
        name: category.name,
        icon: category.icon,
        valueCents: byCategory.get(category.id)!,
      }))
      .sort((a, b) => b.valueCents - a.valueCents || a.name.localeCompare(b.name))
  }, [all, limitRows])

  const unbudgeted = useMemo(() => {
    const budgetedIds = new Set(limitRows.map((row) => row.categoryId))
    return all.filter((category) => !budgetedIds.has(category.id))
  }, [all, limitRows])

  return (
    <motion.div variants={stagger()} initial="hidden" animate="visible" className="flex flex-col gap-5">
      <PageHeader title="Budgets" />

      {categories.isLoading || limits.isLoading ? (
        <PanelLoading height={280} />
      ) : all.length === 0 ? (
        <motion.div
          variants={fadeUp}
          transition={transition}
          className="flex flex-col overflow-hidden rounded-xl border border-border bg-card"
        >
          <EmptyState
            icon={Target}
            title="No expense categories yet"
            description="A limit is set on a category, so there has to be a category first."
            actionLabel="Add a category"
            onAction={() => openCategory('expense')}
          />
        </motion.div>
      ) : (
        <>
          {budgeted.length > 0 && (
            <motion.section
              variants={fadeUp}
              transition={transition}
              className="flex flex-col overflow-hidden rounded-xl border border-border bg-card"
            >
              <SharePie
                slices={budgeted}
                caption="Per month"
                renderTrailing={(slice) => (
                  <LimitButton
                    slice={slice}
                    onEdit={() =>
                      setEditing({
                        categoryId: slice.id,
                        name: slice.name,
                        icon: slice.icon,
                        budgetCents: slice.valueCents,
                      })
                    }
                  />
                )}
              />
            </motion.section>
          )}

          {unbudgeted.length > 0 && (
            <motion.section variants={fadeUp} transition={transition} className="flex flex-col gap-3">
              <header className="flex items-center border-b border-border pb-2">
                <h2 className="heading-tight text-[15px]">No limit set</h2>
              </header>

              <ul className="flex flex-wrap gap-2">
                {unbudgeted.map((category) => (
                  <li key={category.id}>
                    <AddLimitChip
                      category={category}
                      onClick={() =>
                        setEditing({
                          categoryId: category.id,
                          name: category.name,
                          icon: category.icon,
                          budgetCents: 0,
                        })
                      }
                    />
                  </li>
                ))}
              </ul>
            </motion.section>
          )}
        </>
      )}

      <BudgetDialog
        open={editing !== null}
        target={editing ?? undefined}
        onClose={() => setEditing(null)}
      />
    </motion.div>
  )
}

/* The figure is a button, not a field: a limit is committed in the dialog, so
 * the row shows what is set rather than a control that saves on blur. */
function LimitButton({ slice, onEdit }: { slice: ShareSlice; onEdit: () => void }) {
  return (
    <button
      type="button"
      onClick={onEdit}
      aria-label={`Edit the monthly limit for ${slice.name}`}
      className="tabular h-8 shrink-0 rounded-md border border-transparent px-2 text-right text-[13.5px] transition-[border-color,background-color,color] duration-150 ease-[var(--ease-out-brand)] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 group-hoverfine:border-border group-hoverfine:bg-surface hoverfine:text-accent-ink"
    >
      {formatEuro(slice.valueCents)}
    </button>
  )
}

/* Opens the same dialog a set limit opens, so giving a category its first limit
 * and changing one afterwards are the same gesture. */
function AddLimitChip({ category, onClick }: { category: Category; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-9 items-center gap-2 rounded-lg border border-dashed border-border px-3 text-[12.5px] text-muted-foreground transition-[border-color,color,scale] duration-150 ease-[var(--ease-out-brand)] outline-none active:scale-[0.98] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 hoverfine:border-emerald/50 hoverfine:text-foreground"
    >
      <DynamicIcon name={category.icon} className="size-3.5 shrink-0 text-subtle-foreground" />
      {category.name}
      <Plus className="size-3.5 shrink-0 text-subtle-foreground" strokeWidth={2} />
    </button>
  )
}
