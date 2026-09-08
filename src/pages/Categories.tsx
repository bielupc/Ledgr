import { useState } from 'react'
import { motion } from 'motion/react'
import {
  Archive,
  ArchiveRestore,
  ArrowDownLeft,
  ArrowUpRight,
  Pencil,
  Plus,
  Tags,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/empty/EmptyState'
import { PanelLoading } from '@/components/charts/Panel'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { RowAction } from '@/components/table/RowActions'
import { DynamicIcon } from '@/components/brand/DynamicIcon'
import { CategoryDialog } from '@/features/categories/CategoryDialog'
import { useCategories, useDeleteCategory, useRestoreCategory } from '@/features/categories/hooks'
import { fadeUp, stagger, transition } from '@/lib/motion'
import { cn } from '@/lib/utils'
import type { CategoryKind } from '@shared/schemas.ts'
import type { Category } from '@shared/types.ts'

const NO_ROWS: Category[] = []

export default function Categories() {
  const categories = useCategories({ includeDeleted: true })
  const remove = useDeleteCategory()
  const restore = useRestoreCategory()

  const [dialog, setDialog] = useState<{ kind: CategoryKind; category?: Category } | null>(null)
  const [archiving, setArchiving] = useState<Category | null>(null)

  const all = categories.data ?? NO_ROWS

  return (
    <motion.div variants={stagger()} initial="hidden" animate="visible" className="flex flex-col gap-7">
      <PageHeader title="Categories" />

      {(['expense', 'income'] as const).map((kind) => (
        <CategoryGroup
          key={kind}
          kind={kind}
          rows={all.filter((row) => row.kind === kind)}
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
 * in a column and turn the space reserved for the archive control into shared
 * width instead of a tax each tile pays on its own.
 */
function CategoryGroup({
  kind,
  rows,
  isLoading,
  onAdd,
  onEdit,
  onArchive,
  onRestore,
}: {
  kind: CategoryKind
  rows: Category[]
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
  // The same two marks the entry dialog and the transactions tabs switch on, so
  // a direction means one thing everywhere in the app.
  const Direction = expense ? ArrowUpRight : ArrowDownLeft

  return (
    <motion.section variants={fadeUp} transition={transition} className="flex flex-col gap-3">
      <header className="flex items-center gap-2.5 border-b border-border pb-2">
        <span
          className={cn(
            'grid size-6 shrink-0 place-items-center rounded-md border',
            expense ? 'border-negative/35 bg-negative/10' : 'border-positive/35 bg-positive/10',
          )}
        >
          <Direction
            className={cn('size-3.5', expense ? 'text-negative' : 'text-positive')}
            strokeWidth={2.5}
          />
        </span>
        <h2 className="heading-tight text-[15px]">{expense ? 'Expenses' : 'Income'}</h2>
        {/* Beside the title rather than thrown to the far edge: the tiles start
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
        /* The same card the Accounts screen uses, so the two management
           screens share one object rather than each inventing a shape. The
           card is not itself a button: edit is an explicit action beside
           archive, which also keeps a button out of a button.

           `auto-fill` rather than `auto-fit`, because two sections of very
           different length share this track definition: `auto-fit` collapses
           the empty tracks and stretches three income cards to twice the width
           of ten expense ones. The track is wide enough that a name still
           clears the two actions, which hold their space while hidden. */
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(264px,1fr))] gap-3">
          {live.map((category) => (
            <motion.li
              key={category.id}
              variants={fadeUp}
              transition={transition}
              className="group relative isolate flex items-center gap-3 overflow-hidden rounded-xl border border-border bg-card p-3 transition-[border-color] duration-150 ease-[var(--ease-out-brand)] hoverfine:border-border-strong"
            >
              {/* Light off the top-left corner rather than a filled card, so a
                  wall of categories stays Carbon with colour in it. */}
              <span
                aria-hidden
                className="pointer-events-none absolute -top-14 -left-14 -z-10 size-36 rounded-full opacity-0 blur-2xl transition-opacity duration-300 ease-[var(--ease-out-brand)] group-hoverfine:opacity-100 [background:radial-gradient(circle,var(--emerald),transparent_70%)]"
              />

              <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-surface transition-[border-color,background-color,scale] duration-150 ease-[var(--ease-out-brand)] group-hoverfine:scale-105 group-hoverfine:border-emerald/50">
                <DynamicIcon
                  name={category.icon}
                  className="size-4 text-muted-foreground transition-colors duration-150 group-hoverfine:text-accent-ink"
                />
              </span>

              <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
                {category.name}
              </span>

              <span className="flex shrink-0 gap-1">
                <RowAction
                  icon={Pencil}
                  label={`Edit ${category.name}`}
                  onClick={() => onEdit(category)}
                />
                <RowAction
                  icon={Archive}
                  label={`Archive ${category.name}`}
                  tone="destructive"
                  onClick={() => onArchive(category)}
                />
              </span>
            </motion.li>
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
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(264px,1fr))] gap-3">
              {archived.map((category) => (
                <li
                  key={category.id}
                  className="group flex h-11 items-center gap-2.5 rounded-lg border border-dashed border-border pr-1.5 pl-3 text-[12.5px] text-muted-foreground"
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
