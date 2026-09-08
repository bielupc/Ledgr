import { Fragment, useState } from 'react'
import { motion } from 'motion/react'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { ArrowDownLeft, ArrowUpRight, Pencil, Plus, Repeat, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/empty/EmptyState'
import { PanelLoading } from '@/components/charts/Panel'
import { CellMeter } from '@/components/brand/CellMeter'
import { Money } from '@/components/brand/Money'
import { DynamicIcon } from '@/components/brand/DynamicIcon'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { RowAction } from '@/components/table/RowActions'
import { RecurringDialog } from '@/features/recurring/RecurringDialog'
import {
  useDeleteRecurring,
  useRecurringRules,
  useUpdateRecurring,
} from '@/features/recurring/hooks'
import { describeRecurrence, occurrenceDate } from '@shared/recurrence.ts'
import { formatFullDay, todayIso } from '@/lib/format'
import { fadeUp, stagger, transition } from '@/lib/motion'
import { cn } from '@/lib/utils'
import type { RecurringRuleRow } from '@shared/types.ts'

const NO_ROWS: RecurringRuleRow[] = []

/** "in 6 days" beats a date for the only question this screen is asked. */
function countdown(days: number): string {
  if (days < 0) return 'overdue'
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days < 14) return `in ${days} days`
  if (days < 60) return `in ${Math.round(days / 7)} weeks`
  return `in ${Math.round(days / 30)} months`
}

/**
 * How far the current interval has run. The previous occurrence is the step
 * before the next one, measured from the anchor the same way postings are, so
 * the meter and the schedule can never describe different cycles.
 */
function cycleFraction(rule: RecurringRuleRow, today: string): number {
  const previous = occurrenceDate(
    rule.startDate,
    rule.frequency,
    rule.intervalCount,
    Math.max(0, rule.occurrenceIndex - 1),
  )
  const span = differenceInCalendarDays(parseISO(rule.nextRunOn), parseISO(previous))
  if (span <= 0) return 0
  const elapsed = differenceInCalendarDays(parseISO(today), parseISO(previous))
  return Math.min(Math.max(elapsed / span, 0), 1)
}

export default function Recurring() {
  const rules = useRecurringRules()
  const update = useUpdateRecurring()
  const remove = useDeleteRecurring()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<RecurringRuleRow | undefined>()
  const [deleting, setDeleting] = useState<RecurringRuleRow | null>(null)

  const all = rules.data ?? NO_ROWS
  const active = all.filter((rule) => rule.isActive)
  const paused = all.filter((rule) => !rule.isActive)

  const open = (rule?: RecurringRuleRow) => {
    setEditing(rule)
    setDialogOpen(true)
  }

  return (
    <motion.div variants={stagger()} initial="hidden" animate="visible" className="flex flex-col gap-4">
      <PageHeader title="Recurring">
        <Button className="gap-1.5" onClick={() => open()}>
          <Plus className="size-4" strokeWidth={2.25} />
          New series
        </Button>
      </PageHeader>

      <motion.section
        variants={fadeUp}
        transition={transition}
        className="flex flex-col overflow-hidden rounded-xl border border-border bg-card"
      >
        {rules.isLoading ? (
          <PanelLoading height={260} />
        ) : all.length === 0 ? (
          <EmptyState
            icon={Repeat}
            title="Nothing repeats yet"
            description="Set up the entries that arrive every month and they stop being something you remember to type. Anything missed while the app was closed is caught up on the next run."
            actionLabel="Create a series"
            onAction={() => open()}
          />
        ) : (
          <ul className="flex flex-col p-1.5">
            {active.map((rule) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                onToggle={(isActive) => update.mutate({ id: rule.id, input: { isActive } })}
                onEdit={() => open(rule)}
                onDelete={() => setDeleting(rule)}
              />
            ))}

            {paused.length > 0 && (
              <Fragment>
                {/* A named break rather than opacity alone: paused is a state
                    worth reading, not just a dimmer row. */}
                <li className="flex items-center gap-3 px-2.5 pt-4 pb-1.5">
                  <span className="label-mono">Paused</span>
                  <span className="h-px flex-1 bg-border" />
                </li>
                {paused.map((rule) => (
                  <RuleRow
                    key={rule.id}
                    rule={rule}
                    onToggle={(isActive) => update.mutate({ id: rule.id, input: { isActive } })}
                    onEdit={() => open(rule)}
                    onDelete={() => setDeleting(rule)}
                  />
                ))}
              </Fragment>
            )}
          </ul>
        )}
      </motion.section>

      <RecurringDialog
        open={dialogOpen}
        rule={editing}
        onClose={() => {
          setDialogOpen(false)
          setEditing(undefined)
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(next) => !next && setDeleting(null)}
        title={`Delete ${deleting?.name ?? 'this series'}?`}
        description="Future postings stop. Everything it has already posted stays in your history and in every past report, exactly as it is."
        confirmLabel="Delete series"
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id)
          setDeleting(null)
        }}
      />
    </motion.div>
  )
}

function RuleRow({
  rule,
  onToggle,
  onEdit,
  onDelete,
}: {
  rule: RecurringRuleRow
  onToggle: (isActive: boolean) => void
  onEdit: () => void
  onDelete: () => void
}) {
  const active = Boolean(rule.isActive)
  const income = rule.kind === 'income'
  const Direction = income ? ArrowDownLeft : ArrowUpRight

  const today = todayIso()
  const days = differenceInCalendarDays(parseISO(rule.nextRunOn), parseISO(today))
  const imminent = active && days <= 3

  return (
    <li
      data-paused={!active || undefined}
      className="group flex items-center gap-3 rounded-lg px-2.5 py-2.5 transition-[background-color,opacity] duration-150 ease-[var(--ease-out-brand)] data-paused:opacity-55 hoverfine:bg-muted/60"
    >
      <span
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-lg border bg-surface transition-[border-color,scale] duration-150 ease-[var(--ease-out-brand)] group-hoverfine:scale-105',
          active ? 'border-border group-hoverfine:border-emerald/50' : 'border-dashed border-border',
        )}
      >
        <DynamicIcon
          name={rule.categoryIcon ?? rule.accountIcon}
          className="size-4 text-muted-foreground"
        />
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-1.5">
          <Direction
            className={cn('size-3 shrink-0', income ? 'text-positive' : 'text-negative')}
            strokeWidth={2.5}
          />
          <span className="min-w-0 truncate text-[13.5px]">
            {rule.name ?? rule.categoryName ?? (income ? 'Income' : 'Expense')}
          </span>
        </span>
        <span className="truncate text-[11.5px] text-subtle-foreground">
          {describeRecurrence(rule)} · {rule.accountName}
          {rule.categoryName ? ` · ${rule.categoryName}` : ''}
        </span>
      </span>

      {/* Cells filling toward the next posting: the guidelines' own progress
          language, and it turns a column of dates into something with shape. */}
      {active && (
        <span className="hidden shrink-0 items-center gap-3 md:flex">
          <CellMeter fraction={cycleFraction(rule, today)} cells={12} />
          <span
            className={cn(
              'w-[86px] text-right text-[12px]',
              imminent ? 'font-medium text-accent-ink' : 'text-muted-foreground',
            )}
          >
            {countdown(days)}
          </span>
        </span>
      )}

      <span className="flex w-[124px] shrink-0 flex-col items-end gap-0.5">
        <Money
          cents={rule.amountCents}
          tone={income ? 'positive' : 'inherit'}
          className="text-[13.5px]"
        />
        <span className="tabular text-[11px] text-subtle-foreground">
          {active ? formatFullDay(rule.nextRunOn) : 'Paused'}
        </span>
      </span>

      <Switch
        size="sm"
        checked={active}
        onCheckedChange={onToggle}
        aria-label={active ? `Pause ${rule.name ?? 'series'}` : `Resume ${rule.name ?? 'series'}`}
        className="shrink-0"
      />

      <span className="flex w-[68px] shrink-0 justify-end gap-1">
        <RowAction icon={Pencil} label="Edit" onClick={onEdit} />
        <RowAction icon={Trash2} label="Delete series" tone="destructive" onClick={onDelete} />
      </span>
    </li>
  )
}
