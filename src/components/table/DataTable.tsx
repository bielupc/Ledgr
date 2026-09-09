import {
  useTable,
  FlexRender,
  type OnChangeFn,
  type RowData,
  type SortingState,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { tableSetup, type LedgrColumn } from '@/components/table/setup'
import { PanelLoading } from '@/components/charts/Panel'
import { cn } from '@/lib/utils'

interface DataTableProps<T extends RowData> {
  columns: LedgrColumn<T>[]
  data: T[]
  isLoading?: boolean
  /** Shown in place of the table when there are no rows. */
  empty: React.ReactNode
  initialSorting?: SortingState
  /* Sorting is controlled when these are supplied: the rows come from the API
     already ordered, so the table renders the header state rather than
     reordering the page it was handed. */
  sorting?: SortingState
  onSortingChange?: OnChangeFn<SortingState>
  /** Absent for a list short enough to arrive whole. `page` is 1-based. */
  pagination?: {
    page: number
    pageSize: number
    total: number
    onPageChange: (page: number) => void
  }
  rowKey: (row: T) => string
  /* Below `md` the table is replaced by this, per row. Six columns cannot share
     390px — `table-fixed` makes them overlap rather than overflow, so the
     account glyph lands on top of the category. A phone gets the same rows
     stacked instead, and the sort controls go with the header they belonged
     to: on a list that reads newest-first there is nothing to sort by hand. */
  mobileRow?: (row: T) => React.ReactNode
}

export function DataTable<T extends RowData>({
  columns,
  data,
  isLoading,
  empty,
  initialSorting,
  sorting,
  onSortingChange,
  pagination,
  rowKey,
  mobileRow,
}: DataTableProps<T>) {
  const table = useTable({
    features: tableSetup,
    data,
    columns,
    manualSorting: sorting !== undefined,
    state: sorting !== undefined ? { sorting } : undefined,
    onSortingChange,
    initialState: initialSorting ? { sorting: initialSorting } : undefined,
  })

  if (isLoading) return <PanelLoading height={260} />
  if (!data.length) return <>{empty}</>

  const pageCount = pagination ? Math.max(1, Math.ceil(pagination.total / pagination.pageSize)) : 1
  const first = pagination ? (pagination.page - 1) * pagination.pageSize + 1 : 1
  const last = pagination ? Math.min(pagination.page * pagination.pageSize, pagination.total) : 0

  return (
    <>
      {mobileRow && (
        <ul className="flex flex-col md:hidden">
          {table.getRowModel().rows.map((row) => (
            <li
              key={rowKey(row.original)}
              className="border-b border-border/60 last:border-0"
            >
              {mobileRow(row.original)}
            </li>
          ))}
        </ul>
      )}

      <div className={cn('w-full overflow-x-auto', mobileRow && 'hidden md:block')}>
      {/* Fixed layout: with auto layout the flexible column swallows all the
          slack and leaves a canyon between a short name and its category. */}
      <table className="w-full table-fixed border-collapse">
        <thead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id} className="border-b border-border">
              {group.headers.map((header) => {
                const meta = header.column.columnDef.meta
                const sorted = header.column.getIsSorted()
                const Arrow =
                  sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ChevronsUpDown
                const arrow = (
                  <Arrow
                    className={cn(
                      'size-3 transition-opacity duration-150 ease-[var(--ease-out-brand)]',
                      sorted ? 'opacity-100' : 'opacity-0 group-hoverfine/sort:opacity-60',
                    )}
                    strokeWidth={2.5}
                  />
                )

                return (
                  <th
                    key={header.id}
                    aria-sort={
                      sorted === 'asc'
                        ? 'ascending'
                        : sorted === 'desc'
                          ? 'descending'
                          : undefined
                    }
                    className={cn(
                      'label-mono px-3 py-2 font-medium',
                      meta?.align === 'right' ? 'text-right' : 'text-left',
                      meta?.width,
                    )}
                  >
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className={cn(
                          'group/sort inline-flex items-center gap-1 transition-colors duration-150',
                          'hoverfine:text-foreground',
                          sorted && 'text-foreground',
                        )}
                      >
                        {/* The arrow sits on the outside of the label, so it
                            grows into the gutter instead of shifting the
                            heading when a column is sorted. */}
                        {meta?.align === 'right' && arrow}
                        <FlexRender header={header} />
                        {meta?.align !== 'right' && arrow}
                      </button>
                    ) : (
                      <FlexRender header={header} />
                    )}
                  </th>
                )
              })}
            </tr>
          ))}
        </thead>

        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={rowKey(row.original)}
              className="group border-b border-border/60 transition-colors duration-150 ease-[var(--ease-out-brand)] last:border-0 hoverfine:bg-muted/50"
            >
              {row.getAllCells().map((cell) => (
                <td
                  key={cell.id}
                  className={cn(
                    'px-3 py-2 text-[13px]',
                    cell.column.columnDef.meta?.align === 'right' && 'text-right',
                  )}
                >
                  <FlexRender cell={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      {pagination && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-3 py-2.5">
          <p className="label-mono text-muted-foreground">
            {first}–{last} of {pagination.total}
          </p>

          {/* Always mounted, disabled at the bounds: a control that appears only
              on the months long enough to overflow makes the footer jump as you
              step through them, and hides where paging lives. */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Previous page"
              disabled={pagination.page <= 1}
              onClick={() => pagination.onPageChange(pagination.page - 1)}
            >
              <ChevronLeft className="size-4" strokeWidth={2.25} />
            </Button>
            <span className="label-mono px-1 tabular-nums text-muted-foreground">
              {pagination.page} / {pageCount}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Next page"
              disabled={pagination.page >= pageCount}
              onClick={() => pagination.onPageChange(pagination.page + 1)}
            >
              <ChevronRight className="size-4" strokeWidth={2.25} />
            </Button>
          </div>
        </div>
      )}

    </>
  )
}
