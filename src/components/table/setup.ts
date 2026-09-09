import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  tableFeatures,
  type ColumnDef,
  type RowData,
} from '@tanstack/react-table'

/** Per-column presentation the markup needs but the table core does not. */
export interface CellMeta {
  /** Figures go right so their digits line up down the column. */
  align?: 'left' | 'right'
  /** A Tailwind width for a column that should not flex with its content. */
  width?: string
}

/*
 * Sorting is the only feature registered, and it is driven manually: filtering
 * and paging both happen above the table against the API, because the server
 * already takes month, kind, account, category and search, and reordering the
 * page of rows the client happens to hold would silently disagree with the
 * totals underneath. The feature stays registered for the header controls and
 * the sort state they render — the rows arrive in order.
 */
export const tableSetup = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  columnMeta: {} as CellMeta,
})

export type LedgrColumn<T extends RowData> = ColumnDef<typeof tableSetup, T>

export function columnHelperFor<T extends RowData>() {
  return createColumnHelper<typeof tableSetup, T>()
}
