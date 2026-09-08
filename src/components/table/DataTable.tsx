import { useTable, FlexRender, type RowData, type SortingState } from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
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
  rowKey: (row: T) => string
}

export function DataTable<T extends RowData>({
  columns,
  data,
  isLoading,
  empty,
  initialSorting,
  rowKey,
}: DataTableProps<T>) {
  const table = useTable({
    features: tableSetup,
    data,
    columns,
    initialState: initialSorting ? { sorting: initialSorting } : undefined,
  })

  if (isLoading) return <PanelLoading height={260} />
  if (!data.length) return <>{empty}</>

  return (
    <div className="w-full overflow-x-auto">
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
  )
}
