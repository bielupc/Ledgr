import { useState } from 'react'
import { motion } from 'motion/react'
import { Archive, ArchiveRestore, Plus, Tags } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/empty/EmptyState'
import { PanelLoading } from '@/components/charts/Panel'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { RowAction } from '@/components/table/RowActions'
import { Money } from '@/components/brand/Money'
import { DynamicIcon } from '@/components/brand/DynamicIcon'
import { CategoryDialog } from '@/features/categories/CategoryDialog'
import { useCategories, useDeleteCategory, useRestoreCategory } from '@/features/categories/hooks'
import { useBudgetLimits } from '@/features/budgets/hooks'
import { fadeUp, stagger, transition } from '@/lib/motion'
import { cn } from '@/lib/utils'
import type { CategoryKind } from '@shared/schemas.ts'
import type { BudgetStatus, Category } from '@shared/types.ts'

const NO_ROWS: Category[] = []
const NO_LIMITS: BudgetStatus[] = []

export default function Categories() {
  const categories = useCategories({ includeDeleted: true })
  const limits = useBudgetLimits()
  const remove = useDeleteCategory()
  const restore = useRestoreCategory()

  const [dialog, setDialog] = useState<{ kind: CategoryKind; category?: Category } | null>(null)
  const [archiving, setArchiving] = useState<Category | null>(null)

  const all = categories.data ?? NO_ROWS
  /* The limit is read here and set on the Budgets screen: it is the one piece
     of live state a category carries, and without it this page only tells the
     owner the names they chose themselves. */
  const byCategory = new Map(
    (limits.data ?? NO_LIMITS).map((row) => [row.categoryId, row.budgetCents]),
  )

  return (
    <motion.div variants={stagger()} initial="hidden" animate="visible" className="flex flex-col gap-7">
      <PageHeader title="Categories" />

      {(['expense', 'income'] as const).map((kind) => (
        <CategoryGroup
          key={kind}
          kind={kind}
          rows={all.filter((row) => row.kind === kind)}
          limits={byCategory}
          isLoading={categories.isLoading}
          onAdd={() => setDialog({ kind })}
          onEdit={(category) => setDialog({ kind, category })}
          onArchive={setArchiving}
          onRestore={(id) => restore.mutate(id)}
        />
      ))}

      <CategoryDialog
        open={dialog !== null}
        kind={dialog?.kind ?? 'expense'}
        category={dialog?.category}
        onClose={() => setDialog(null)}
      />

      <ConfirmDialog
        open={archiving !== null}
        onOpenChange={(next) => !next && setArchiving(null)}
        title={`Archive ${archiving?.name ?? 'this category'}?`}
        description="It leaves every picker, its budget is removed and any recurring rules filed under it are paused. Transactions already in it keep it, so past months still read correctly. You can restore it later."
        confirmLabel="Archive"
        onConfirm={() => {
          if (archiving) remove.mutate(archiving.id)
          setArchiving(null)
        }}
      />
    </motion.div>
  )
}

/*
 * A uniform grid rather than a wrapping row of content-width pills. Pills sized
 * to their own labels leave nothing to scan down: names land at thirteen
 * different x positions and the right edge frays. Fixed tracks put every name
 * in a column, give the second line somewhere consistent to sit, and turn the
 * space reserved for the archive control into shared width instead of a tax
 * each tile pays on its own.
 */
function CategoryGroup({
  kind,
  rows,
  limits,
  isLoading,
  onAdd,
  onEdit,
  onArchive,
  onRestore,
}: {
  kind: CategoryKind
  rows: Category[]
  limits: Map<string, number>
  isLoading: boolean
  onAdd: () => void
  onEdit: (category: Category) => void
  onArchive: (category: Category) => void
  onRestore: (id: string) => void
}) {
  const [showArchived, setShowArchived] = useState(false)
  const live = rows.filter((row) => !row.deletedAt)
  const archived = rows.filter((row) => row.deletedAt)
  const expense = kind === 'expense'

  return (
    <motion.section variants={fadeUp} transition={transition} className="flex flex-col gap-3">
      <header className="flex items-center gap-3 border-b border-border pb-2">
        <h2 className="heading-tight text-[15px]">{expense ? 'Expenses' : 'Income'}</h2>
        <span className="tabular text-[12px] text-subtle-foreground">{live.length}</span>
        {/* Beside the count rather than thrown to the far edge: the tiles start
            at the left, so a control 1400px away is a long way to go for it. */}
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={onAdd}>
          <Plus className="size-3.5" strokeWidth={2.25} />
          Add
        </Button>
      </header>

      {isLoading ? (
        <PanelLoading height={120} />
      ) : live.length === 0 ? (
        <div className="flex flex-col rounded-xl border border-dashed border-border">
          <EmptyState
            icon={Tags}
            title={`No ${kind} categories`}
            description={
              expense
                ? 'Categories are what the expense breakdown and every budget are built on.'
                : 'Group what comes in, so the income breakdown has something to say.'
            }
            actionLabel="Add a category"
            onAction={onAdd}
            size="sm"
          />
        </div>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(196px,1fr))] gap-2">
          {live.map((category) => (
            <li key={category.id} className="group relative">
              {/* The tile is the edit affordance and archive sits beside it, not
                  inside it: a button within a button is invalid markup. */}
              <button
                type="button"
                onClick={() => onEdit(category)}
                className={cn(
                  'flex w-full flex-col justify-center gap-1 rounded-lg border border-border bg-card pr-9 pl-3 text-left transition-[border-color,background-color,scale] duration-150 ease-[var(--ease-out-brand)] outline-none active:scale-[0.98] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 hoverfine:border-emerald/50 hoverfine:bg-muted/60',
                  expense ? 'h-[58px]' : 'h-11',
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <DynamicIcon
                    name={category.icon}
                    className="size-4 shrink-0 text-muted-foreground transition-colors duration-150 group-hoverfine:text-accent-ink"
                  />
                  <span className="truncate text-[13px]">{category.name}</span>
                </span>

                {/* Only expenses can carry a limit, so only they get a second
                    line. Absence is stated rather than left blank: whether a
                    category is governed is the question this line answers. */}
                {expense && (
                  <span className="truncate pl-6 text-[11px] text-subtle-foreground">
                    {limits.has(category.id) ? (
                      <>
                        Limit{' '}
                        <Money
                          cents={limits.get(category.id)!}
                          className="text-[11px] text-muted-foreground"
                        />
                      </>
                    ) : (
                      'No limit'
                    )}
                  </span>
                )}
              </button>

              <span className="absolute top-1/2 right-1.5 -translate-y-1/2">
                <RowAction
                  icon={Archive}
                  label={`Archive ${category.name}`}
                  tone="destructive"
                  onClick={() => onArchive(category)}
                />
              </span>
            </li>
          ))}
        </ul>
      )}

      {archived.length > 0 && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setShowArchived((open) => !open)}
            aria-expanded={showArchived}
            className="flex w-fit items-center gap-2 text-[12px] text-subtle-foreground transition-colors duration-150 hoverfine:text-foreground"
          >
            <Archive className="size-3" strokeWidth={1.75} />
            {showArchived ? 'Hide' : 'Show'} {archived.length} archived
          </button>

          {showArchived && (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(196px,1fr))] gap-2">
              {archived.map((category) => (
                <li
                  key={category.id}
                  className="group flex h-11 items-center gap-2 rounded-lg border border-dashed border-border pr-1.5 pl-3 text-[12.5px] text-muted-foreground"
                >
                  <DynamicIcon
                    name={category.icon}
                    className="size-3.5 shrink-0 text-subtle-foreground"
                  />
                  <span className="min-w-0 flex-1 truncate">{category.name}</span>
                  <RowAction
                    icon={ArchiveRestore}
                    label={`Restore ${category.name}`}
                    onClick={() => onRestore(category.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </motion.section>
  )
}
