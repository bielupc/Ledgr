import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  Plus,
  Receipt,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/layout/PageHeader'
import { MonthPicker } from '@/components/MonthPicker'
import { EmptyState } from '@/components/empty/EmptyState'
import { Money } from '@/components/brand/Money'
import { DynamicIcon } from '@/components/brand/DynamicIcon'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DataTable } from '@/components/table/DataTable'
import { columnHelperFor, type LedgrColumn } from '@/components/table/setup'
import { FilterBar } from '@/components/table/FilterBar'
import { useFilters, ANY } from '@/components/table/filters'
import { RowActions } from '@/components/table/RowActions'
import { EntryDialog, type EntryRecord } from '@/features/transactions/EntryDialog'
import { useAccounts } from '@/features/accounts/hooks'
import { useCategories } from '@/features/categories/hooks'
import { useTransactions, useDeleteTransaction } from '@/features/transactions/hooks'
import { useTransfers, useDeleteTransfer } from '@/features/transfers/hooks'
import { useQuickActions } from '@/features/quick-actions/QuickActions'
import { useMonthParam } from '@/hooks/useMonthParam'
import { useParamState } from '@/hooks/useParamState'
import { formatDay, formatMonthLong } from '@/lib/format'
import { fadeUp, stagger, transition } from '@/lib/motion'
import { cn } from '@/lib/utils'
import type { CategoryKind } from '@shared/schemas.ts'
import type { TransactionRow, TransferRow } from '@shared/types.ts'

const VIEWS = ['expense', 'income', 'transfer'] as const
type View = (typeof VIEWS)[number]

/*
 * The same three marks the entry dialog switches on, so the arrow that means
 * "money out" means it in both places. Tinted only on the selected tab: three
 * coloured arrows at rest would make a quiet control the loudest thing on the
 * screen.
 */
const TABS: { value: View; label: string; icon: LucideIcon; tint: string }[] = [
  { value: 'expense', label: 'Expenses', icon: ArrowUpRight, tint: 'text-negative' },
  { value: 'income', label: 'Income', icon: ArrowDownLeft, tint: 'text-positive' },
  { value: 'transfer', label: 'Transfers', icon: ArrowLeftRight, tint: 'text-transfer' },
]

/** Income is a mass noun, so "no incomes in September" is wrong: the empty
 *  states name each kind rather than pluralising the view. */
const NOUNS: Record<View, string> = {
  expense: 'expenses',
  income: 'income',
  transfer: 'transfers',
}

const NO_ROWS: never[] = []

const transactionColumn = columnHelperFor<TransactionRow>()
const transferColumn = columnHelperFor<TransferRow>()

/** Icon plus label, the shape every reference in these tables takes. */
function Ref({
  icon,
  label,
  muted,
}: {
  icon: string | null
  label: string
  muted?: boolean
}) {
  return (
    <span className={muted ? 'flex items-center gap-2 text-muted-foreground' : 'flex items-center gap-2'}>
      <DynamicIcon name={icon} className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 truncate">{label}</span>
    </span>
  )
}

export default function Transactions() {
  const [month, setMonth] = useMonthParam()
  const [view, setView] = useParamState<View>('view', 'expense', VIEWS)
  const [filters, setFilters, filtersActive] = useFilters()
  const { openTransaction, openTransfer } = useQuickActions()

  const [editing, setEditing] = useState<EntryRecord | null>(null)
  const [deleting, setDeleting] = useState<EntryRecord | null>(null)

  const isTransferView = view === 'transfer'
  const accounts = useAccounts()
  const categories = useCategories({ kind: isTransferView ? 'expense' : (view as CategoryKind) })

  const query = {
    month,
    accountId: filters.accountId === ANY ? undefined : filters.accountId,
    search: filters.search || undefined,
  }

  /*
   * Both lists are fetched whichever tab is open. The API is a local process,
   * so the second query costs milliseconds, and it buys an instant tab switch
   * on a control that is used constantly.
   */
  const transactions = useTransactions({
    ...query,
    kind: isTransferView ? 'expense' : view,
    categoryId: filters.categoryId === ANY ? undefined : filters.categoryId,
  })
  const transfers = useTransfers(query)

  const deleteTransaction = useDeleteTransaction()
  const deleteTransfer = useDeleteTransfer()

  const transactionColumns = useMemo<LedgrColumn<TransactionRow>[]>(
    () =>
      transactionColumn.columns([
        transactionColumn.accessor('occurredOn', {
          header: 'Date',
          meta: { width: 'w-[88px]' },
          cell: (info) => <span className="tabular text-muted-foreground">{formatDay(info.getValue())}</span>,
        }),
        transactionColumn.accessor((row) => row.name ?? row.categoryName ?? 'Uncategorised', {
          id: 'name',
          header: 'Name',
          meta: { width: 'w-[34%]' },
          // The row's own label leads and the category stands in when it has
          // none, so a table is never a column of the same word repeated.
          cell: (info) => (
            <Ref icon={info.row.original.icon ?? info.row.original.categoryIcon} label={info.getValue()} />
          ),
        }),
        transactionColumn.accessor((row) => row.categoryName ?? 'Uncategorised', {
          id: 'category',
          header: 'Category',
          meta: { width: 'w-[22%]' },
          cell: (info) => (
            <span className="truncate text-muted-foreground">{info.getValue()}</span>
          ),
        }),
        transactionColumn.accessor('accountName', {
          header: 'Account',
          meta: { width: 'w-[22%]' },
          cell: (info) => (
            <Ref icon={info.row.original.accountIcon} label={info.getValue()} muted />
          ),
        }),
        transactionColumn.accessor('amountCents', {
          header: 'Amount',
          meta: { align: 'right', width: 'w-[132px]' },
          cell: (info) => (
            <Money
              cents={info.getValue()}
              tone={info.row.original.kind === 'income' ? 'positive' : 'inherit'}
            />
          ),
        }),
        transactionColumn.display({
          id: 'actions',
          header: '',
          meta: { align: 'right', width: 'w-[76px]' },
          cell: (info) => (
            <RowActions
              onEdit={() => setEditing({ type: 'transaction', row: info.row.original })}
              onDelete={() => setDeleting({ type: 'transaction', row: info.row.original })}
            />
          ),
        }),
      ]) as LedgrColumn<TransactionRow>[],
    [],
  )

  const transferColumns = useMemo<LedgrColumn<TransferRow>[]>(
    () =>
      transferColumn.columns([
        transferColumn.accessor('occurredOn', {
          header: 'Date',
          meta: { width: 'w-[88px]' },
          cell: (info) => <span className="tabular text-muted-foreground">{formatDay(info.getValue())}</span>,
        }),
        transferColumn.display({
          id: 'route',
          header: 'Moved',
          // Two accounts and an arrow: a transfer has no name to lead with,
          // it is the route.
          cell: (info) => (
            <span className="flex items-center gap-2">
              <Ref icon={info.row.original.fromAccountIcon} label={info.row.original.fromAccountName} />
              <ArrowRight className="size-3.5 shrink-0 text-transfer" strokeWidth={2.25} />
              <Ref icon={info.row.original.toAccountIcon} label={info.row.original.toAccountName} />
            </span>
          ),
        }),
        transferColumn.accessor((row) => row.note ?? '', {
          id: 'note',
          header: 'Note',
          meta: { width: 'w-[30%]' },
          cell: (info) => <span className="truncate text-muted-foreground">{info.getValue()}</span>,
        }),
        transferColumn.accessor('amountCents', {
          header: 'Amount',
          meta: { align: 'right', width: 'w-[132px]' },
          cell: (info) => <Money cents={info.getValue()} />,
        }),
        transferColumn.display({
          id: 'actions',
          header: '',
          meta: { align: 'right', width: 'w-[76px]' },
          cell: (info) => (
            <RowActions
              onEdit={() => setEditing({ type: 'transfer', row: info.row.original })}
              onDelete={() => setDeleting({ type: 'transfer', row: info.row.original })}
            />
          ),
        }),
      ]) as LedgrColumn<TransferRow>[],
    [],
  )

  const isLoading = isTransferView ? transfers.isLoading : transactions.isLoading

  const confirmDelete = () => {
    if (!deleting) return
    if (deleting.type === 'transfer') deleteTransfer.mutate(deleting.row.id)
    else deleteTransaction.mutate(deleting.row.id)
    setDeleting(null)
  }

  return (
    <motion.div variants={stagger()} initial="hidden" animate="visible" className="flex flex-col gap-4">
      <PageHeader title="Transactions">
        <MonthPicker month={month} onChange={setMonth} />
        <Button
          className="gap-1.5"
          onClick={() => (isTransferView ? openTransfer() : openTransaction(view as CategoryKind))}
        >
          <Plus className="size-4" strokeWidth={2.25} />
          Add {isTransferView ? 'transfer' : view}
        </Button>
      </PageHeader>

      <motion.div variants={fadeUp} transition={transition} className="flex flex-col gap-3">
        <Tabs value={view} onValueChange={(next) => setView(next as View)}>
          {/* Centred on a phone: the row holds nothing else there, and a
              switcher hard against the left edge reads as the start of a list
              rather than the control for the one below it. */}
          <div className="flex flex-wrap items-center justify-center gap-3 sm:justify-between">
            <TabsList>
              {TABS.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value}>
                  <tab.icon
                    className={cn(
                      'size-3.5 transition-colors duration-150 ease-[var(--ease-out-brand)]',
                      view === tab.value ? tab.tint : 'text-muted-foreground',
                    )}
                    strokeWidth={2.25}
                  />
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </Tabs>

        <FilterBar
          filters={filters}
          onChange={setFilters}
          accounts={accounts.data ?? NO_ROWS}
          categories={isTransferView ? undefined : (categories.data ?? NO_ROWS)}
          active={filtersActive}
          placeholder={isTransferView ? 'Search notes and accounts' : 'Search names, categories and accounts'}
        />

        <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
          {isTransferView ? (
            <DataTable
              columns={transferColumns}
              data={transfers.data ?? NO_ROWS}
              isLoading={transfers.isLoading}
              rowKey={(row) => row.id}
              initialSorting={[{ id: 'occurredOn', desc: true }]}
              mobileRow={(row) => (
                <button
                  type="button"
                  onClick={() => setEditing({ type: 'transfer', row })}
                  className="flex w-full items-center gap-3 px-3 py-3 text-left active:bg-muted/50"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-surface">
                    <ArrowLeftRight className="size-4 text-transfer" strokeWidth={2} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    {/* A transfer has no name, so the route is the label. */}
                    <span className="truncate text-[14px] font-medium">
                      {row.fromAccountName} → {row.toAccountName}
                    </span>
                    <span className="truncate text-[12px] text-subtle-foreground">
                      {formatDay(row.occurredOn)}
                      {row.note ? ` · ${row.note}` : ''}
                    </span>
                  </span>
                  <Money cents={row.amountCents} className="shrink-0 text-[14px]" />
                </button>
              )}
              empty={
                <EmptyState
                  icon={ArrowLeftRight}
                  title={
                    filtersActive
                      ? 'Nothing matches those filters'
                      : `No transfers in ${formatMonthLong(month)}`
                  }
                  description={''}
                  actionLabel={filtersActive ? 'Clear filters' : 'Record a transfer'}
                  onAction={
                    filtersActive
                      ? () => setFilters({ search: '', accountId: ANY, categoryId: ANY })
                      : openTransfer
                  }
                  size="sm"
                />
              }
            />
          ) : (
            <DataTable
              columns={transactionColumns}
              data={transactions.data ?? NO_ROWS}
              isLoading={isLoading}
              rowKey={(row) => row.id}
              initialSorting={[{ id: 'occurredOn', desc: true }]}
              mobileRow={(row) => (
                <button
                  type="button"
                  onClick={() => setEditing({ type: 'transaction', row })}
                  className="flex w-full items-center gap-3 px-3 py-3 text-left active:bg-muted/50"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-surface">
                    <DynamicIcon
                      name={row.icon ?? row.categoryIcon}
                      className="size-4 text-muted-foreground"
                    />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[14px] font-medium">
                      {row.name ?? row.categoryName ?? 'Uncategorised'}
                    </span>
                    {/* The date alone. The category is already the glyph on
                        the left, and the account is not what a row is
                        recognised by — both only crowded the label. */}
                    <span className="truncate text-[12px] text-subtle-foreground">
                      {formatDay(row.occurredOn)}
                    </span>
                  </span>
                  <Money
                    cents={row.amountCents}
                    tone={row.kind === 'income' ? 'positive' : 'inherit'}
                    className="shrink-0 text-[14px]"
                  />
                </button>
              )}
              empty={
                <EmptyState
                  icon={Receipt}
                  title={
                    filtersActive
                      ? 'Nothing matches those filters'
                      : `No ${NOUNS[view]} in ${formatMonthLong(month)}`
                  }
                  description={''}
                  actionLabel={filtersActive ? 'Clear filters' : `Add ${view}`}
                  onAction={
                    filtersActive
                      ? () => setFilters({ search: '', accountId: ANY, categoryId: ANY })
                      : () => openTransaction(view as CategoryKind)
                  }
                  size="sm"
                />
              }
            />
          )}
        </div>
      </motion.div>

      <EntryDialog
        open={editing !== null}
        initialMode={editing?.type === 'transfer' ? 'transfer' : (editing?.row.kind ?? 'expense')}
        record={editing ?? undefined}
        onClose={() => setEditing(null)}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(next) => !next && setDeleting(null)}
        title={deleting?.type === 'transfer' ? 'Delete this transfer?' : 'Delete this entry?'}
        description={
          deleting?.type === 'transfer'
            ? 'Both account balances go back to what they were. This cannot be undone.'
            : 'It leaves the ledger for good, and the balances and budgets it moved are recalculated without it.'
        }
        confirmLabel="Delete"
        onConfirm={confirmDelete}
      />
    </motion.div>
  )
}
