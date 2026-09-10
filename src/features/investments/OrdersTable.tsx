import { useMemo, useState } from 'react'
import { Receipt } from 'lucide-react'
import { Panel } from '@/components/charts/Panel'
import { EmptyState } from '@/components/empty/EmptyState'
import { Badge } from '@/components/ui/badge'
import { Money } from '@/components/brand/Money'
import { DataTable } from '@/components/table/DataTable'
import { columnHelperFor, type LedgrColumn } from '@/components/table/setup'
import { ImportOrdersButton } from '@/features/investments/ImportOrdersButton'
import { useOrders } from '@/features/investments/hooks'
import { formatDay } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { InvestmentOrderRow } from '@shared/types.ts'

const PAGE_SIZE = 15

const KIND_LABEL: Record<InvestmentOrderRow['kind'], string> = {
  buy: 'Buy',
  sell: 'Sell',
  transferIn: 'Transfer in',
  transferOut: 'Transfer out',
}

function KindBadge({ kind }: { kind: InvestmentOrderRow['kind'] }) {
  const external = kind === 'buy' || kind === 'sell'
  return (
    <Badge
      variant="outline"
      className={cn(
        !external && 'text-subtle-foreground',
        kind === 'buy' && 'border-positive/35 text-positive',
        kind === 'sell' && 'border-negative/35 text-negative',
      )}
    >
      {KIND_LABEL[kind]}
    </Badge>
  )
}

const column = columnHelperFor<InvestmentOrderRow>()
const NO_ROWS: InvestmentOrderRow[] = []

/** The orders list has no server-side filter to keep a total in step with —
 *  unlike `/transactions`, it always arrives whole — so pagination is a plain
 *  client-side slice rather than page/offset query params. */
export function OrdersTable() {
  const orders = useOrders()
  const rows = orders.data ?? NO_ROWS
  const [page, setPage] = useState(1)

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const clampedPage = Math.min(page, pageCount)
  const pageRows = rows.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE)

  const columns = useMemo<LedgrColumn<InvestmentOrderRow>[]>(
    () =>
      column.columns([
        column.accessor('tradedOn', {
          header: 'Date',
          meta: { width: 'w-[84px]' },
          cell: (info) => <span className="tabular text-muted-foreground">{formatDay(info.getValue())}</span>,
        }),
        column.accessor((row) => row.fundShortName ?? row.fundName, {
          id: 'fund',
          header: 'Asset',
          meta: { width: 'w-[30%]' },
          cell: (info) => <span className="block truncate">{info.getValue()}</span>,
        }),
        column.accessor('kind', {
          header: 'Type',
          meta: { width: 'w-[112px]' },
          cell: (info) => <KindBadge kind={info.getValue()} />,
        }),
        column.accessor('shareUnits', {
          header: 'Shares',
          meta: { align: 'right', width: 'w-[100px]' },
          cell: (info) => (
            <span className="tabular text-muted-foreground">{(info.getValue() / 100_000_000).toFixed(3)}</span>
          ),
        }),
        column.accessor('navMicros', {
          header: 'NAV',
          meta: { align: 'right', width: 'w-[92px]' },
          cell: (info) => <Money cents={Math.round((info.getValue() / 1_000_000) * 100)} className="text-[13px]" />,
        }),
        column.accessor('amountCents', {
          header: 'Amount',
          meta: { align: 'right', width: 'w-[110px]' },
          cell: (info) => <Money cents={info.getValue()} className="text-[13px]" />,
        }),
      ]) as LedgrColumn<InvestmentOrderRow>[],
    [],
  )

  return (
    <Panel title="Orders" bodyClassName="px-0 pb-0">
      <div className="flex flex-col overflow-hidden rounded-b-xl">
        <DataTable
          columns={columns}
          data={pageRows}
          isLoading={orders.isLoading}
          rowKey={(row) => row.id}
          pagination={{
            page: clampedPage,
            pageSize: PAGE_SIZE,
            total: rows.length,
            onPageChange: setPage,
          }}
          mobileRow={(row) => (
            <div className="flex w-full items-center gap-3 px-3 py-3">
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[14px] font-medium">
                  {row.fundShortName ?? row.fundName}
                </span>
                <span className="flex items-center gap-1.5 text-[12px] text-subtle-foreground">
                  {formatDay(row.tradedOn)} · {KIND_LABEL[row.kind]}
                </span>
              </span>
              <Money cents={row.amountCents} className="shrink-0 text-[14px]" />
            </div>
          )}
          empty={
            <EmptyState icon={Receipt} title="No orders yet" description="" size="sm">
              <ImportOrdersButton size="sm" />
            </EmptyState>
          }
        />
      </div>
    </Panel>
  )
}
