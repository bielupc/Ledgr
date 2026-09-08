import { useState } from 'react'
import { motion } from 'motion/react'
import { Plus, Target, X } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/empty/EmptyState'
import { PanelLoading } from '@/components/charts/Panel'
import { CellMeter } from '@/components/brand/CellMeter'
import { Money } from '@/components/brand/Money'
import { DynamicIcon } from '@/components/brand/DynamicIcon'
import { RowAction } from '@/components/table/RowActions'
import { useCategories } from '@/features/categories/hooks'
import { useBudgetLimits, useClearBudget, useSetBudget } from '@/features/budgets/hooks'
import { useQuickActions } from '@/features/quick-actions/QuickActions'
import { fadeUp, stagger, transition } from '@/lib/motion'
import type { BudgetStatus, Category } from '@shared/types.ts'

const NO_CATEGORIES: Category[] = []
const NO_LIMITS: BudgetStatus[] = []

/** The locale writes decimals with a comma, so both separators are accepted. */
function parseLimit(draft: string): number | null {
  const normalised = draft.replace(/\s/g, '').replace(',', '.')
  if (normalised === '') return null
  const value = Number(normalised)
  if (!Number.isFinite(value) || value <= 0) return null
  return Math.round(value * 100)
}

function toDraft(cents: number): string {
  return String(cents / 100).replace('.', ',')
}

export default function Budgets() {
  const categories = useCategories({ kind: 'expense' })
  const limits = useBudgetLimits()
  const setBudget = useSetBudget()
  const clearBudget = useClearBudget()
  const { openCategory } = useQuickActions()

  const all = categories.data ?? NO_CATEGORIES
  const byCategory = new Map(
    (limits.data ?? NO_LIMITS).map((row) => [row.categoryId, row.budgetCents]),
  )

  /* Two populations, not one list with holes: a category with a limit is a
     figure to read and adjust, one without is a candidate to pick. Ranked by
     the limit itself, which is the only ordering the page's own data supports
     now that spend has left it. */
  const budgeted = all
    .filter((category) => byCategory.has(category.id))
    .map((category) => ({ category, budgetCents: byCategory.get(category.id)! }))
    .sort(
      (a, b) =>
        b.budgetCents - a.budgetCents || a.category.name.localeCompare(b.category.name),
    )
  const unbudgeted = all.filter((category) => !byCategory.has(category.id))

  const totalCents = budgeted.reduce((sum, row) => sum + row.budgetCents, 0)
  const largestCents = budgeted[0]?.budgetCents ?? 0

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
          {/* Said once, because it is the meaning of every figure below. */}
          <motion.p
            variants={fadeUp}
            transition={transition}
            className="text-[12.5px] text-subtle-foreground"
          >
            Each limit applies to every month and resets on the 1st, with nothing carried over.
          </motion.p>

          {budgeted.length > 0 && (
            <motion.section
              variants={fadeUp}
              transition={transition}
              className="flex flex-col overflow-hidden rounded-xl border border-border bg-card"
            >
              {/* The one aggregate a set of standing limits has: what they
                  commit per month. It sits on the panel rather than in the page
                  header, where the shell's dither field runs behind the right
                  edge and bare text has no ground to hold onto. */}
              <header className="flex items-baseline justify-between gap-3 border-b border-border px-3.5 py-2.5">
                <span className="text-[12px] text-subtle-foreground">
                  {budgeted.length} {budgeted.length === 1 ? 'category' : 'categories'}
                </span>
                <span className="flex items-baseline gap-2.5">
                  <span className="label-mono">Per month</span>
                  <Money cents={totalCents} className="display-tight text-[17px]" />
                </span>
              </header>

              <ul className="flex flex-col p-1.5">
                {budgeted.map(({ category, budgetCents }, index) => (
                  <LimitRow
                    key={category.id}
                    category={category}
                    budgetCents={budgetCents}
                    share={largestCents > 0 ? budgetCents / largestCents : 0}
                    index={index}
                    onSet={(amountCents) =>
                      setBudget.mutate({ categoryId: category.id, amountCents })
                    }
                    onClear={() => clearBudget.mutate(category.id)}
                  />
                ))}
              </ul>
            </motion.section>
          )}

          {unbudgeted.length > 0 && (
            <motion.section variants={fadeUp} transition={transition} className="flex flex-col gap-3">
              <header className="flex items-center gap-3 border-b border-border pb-2">
                <h2 className="heading-tight text-[15px]">No limit set</h2>
                <span className="tabular text-[12px] text-subtle-foreground">
                  {unbudgeted.length}
                </span>
              </header>

              <ul className="flex flex-wrap gap-2">
                {unbudgeted.map((category) => (
                  <li key={category.id}>
                    <AddLimitChip
                      category={category}
                      onSet={(amountCents) =>
                        setBudget.mutate({ categoryId: category.id, amountCents })
                      }
                    />
                  </li>
                ))}
              </ul>
            </motion.section>
          )}
        </>
      )}
    </motion.div>
  )
}

function LimitRow({
  category,
  budgetCents,
  share,
  index,
  onSet,
  onClear,
}: {
  category: Category
  budgetCents: number
  share: number
  index: number
  onSet: (amountCents: number) => void
  onClear: () => void
}) {
  /*
   * The field holds a draft while it is being typed into, and takes the
   * server's figure back whenever that changes underneath it. Adjusted during
   * render rather than in an effect: an effect would paint the stale figure
   * first and only then correct it, and it would fire on the render the commit
   * itself causes, overwriting what was just typed.
   */
  const [draft, setDraft] = useState(() => toDraft(budgetCents))
  const [settled, setSettled] = useState(budgetCents)
  if (settled !== budgetCents) {
    setSettled(budgetCents)
    setDraft(toDraft(budgetCents))
  }

  const commit = () => {
    if (draft.trim() === '') {
      onClear()
      return
    }
    const cents = parseLimit(draft)
    // Anything unreadable puts the stored figure back rather than clearing a
    // limit off a stray keystroke; removing one is what the × is for.
    if (cents === null) {
      setDraft(toDraft(budgetCents))
      return
    }
    if (cents !== budgetCents) onSet(cents)
  }

  return (
    <li className="group flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors duration-150 ease-[var(--ease-out-brand)] hoverfine:bg-muted/60">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-surface transition-[border-color,scale] duration-150 ease-[var(--ease-out-brand)] group-hoverfine:scale-105 group-hoverfine:border-emerald/50">
        <DynamicIcon
          name={category.icon}
          className="size-4 text-muted-foreground transition-colors duration-150 group-hoverfine:text-accent-ink"
        />
      </span>

      <span className="min-w-0 flex-1 truncate text-[13.5px]">{category.name}</span>

      {/* Ranks the limits against the largest one before a figure is read.
          Neutral, because a limit on its own has no state to report. */}
      <CellMeter
        fraction={share}
        cells={14}
        tone="neutral"
        delayMs={index * 40}
        className="hidden md:inline-flex"
      />

      {/* The figure is the field. It carries no chrome until the row is hovered
          or it takes focus, so the column reads as a column of amounts rather
          than a stack of form controls. */}
      <span className="relative w-[124px] shrink-0">
        <input
          value={draft}
          inputMode="decimal"
          aria-label={`Monthly limit for ${category.name}`}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              event.currentTarget.blur()
            }
            if (event.key === 'Escape') {
              setDraft(toDraft(budgetCents))
              event.currentTarget.blur()
            }
          }}
          className="tabular h-8 w-full rounded-md border border-transparent bg-transparent pr-6 pl-2 text-right text-[13.5px] outline-none transition-[border-color,background-color] duration-150 ease-[var(--ease-out-brand)] group-hoverfine:border-border group-hoverfine:bg-surface focus:border-ring focus:bg-surface focus:ring-[3px] focus:ring-ring/50"
        />
        <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[12px] text-subtle-foreground">
          €
        </span>
      </span>

      <span className="flex w-7 shrink-0 justify-end">
        <RowAction
          icon={X}
          label={`Remove the limit on ${category.name}`}
          tone="destructive"
          onClick={onClear}
        />
      </span>
    </li>
  )
}

/*
 * Opens into an amount in place, so giving a category its first limit is one
 * click and a number without the eye leaving the chip it started on. Once
 * committed the category leaves this row and joins the ranked list above.
 */
function AddLimitChip({
  category,
  onSet,
}: {
  category: Category
  onSet: (amountCents: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const commit = () => {
    const cents = parseLimit(draft)
    if (cents !== null) onSet(cents)
    setEditing(false)
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft('')
          setEditing(true)
        }}
        className="flex h-9 items-center gap-2 rounded-lg border border-dashed border-border px-3 text-[12.5px] text-muted-foreground transition-[border-color,color,scale] duration-150 ease-[var(--ease-out-brand)] outline-none active:scale-[0.98] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 hoverfine:border-emerald/50 hoverfine:text-foreground"
      >
        <DynamicIcon name={category.icon} className="size-3.5 shrink-0 text-subtle-foreground" />
        {category.name}
        <Plus className="size-3.5 shrink-0 text-subtle-foreground" strokeWidth={2} />
      </button>
    )
  }

  return (
    <span className="flex h-9 items-center gap-2 rounded-lg border border-border bg-card pr-1.5 pl-3 text-[12.5px]">
      <DynamicIcon name={category.icon} className="size-3.5 shrink-0 text-muted-foreground" />
      {category.name}
      <span className="relative w-[82px]">
        <input
          autoFocus
          value={draft}
          inputMode="decimal"
          placeholder="0"
          aria-label={`Monthly limit for ${category.name}`}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              event.currentTarget.blur()
            }
            if (event.key === 'Escape') {
              setDraft('')
              setEditing(false)
            }
          }}
          className="tabular h-7 w-full rounded border border-border bg-surface pr-5 pl-1.5 text-right text-[12.5px] outline-none transition-[border-color,box-shadow] duration-150 ease-[var(--ease-out-brand)] focus:border-ring focus:ring-[3px] focus:ring-ring/50"
        />
        <span className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 text-[11px] text-subtle-foreground">
          €
        </span>
      </span>
    </span>
  )
}
