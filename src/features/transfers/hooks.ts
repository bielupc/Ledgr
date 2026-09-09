import { useCallback } from 'react'
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import { useOptimisticPage } from '@/features/ledger'
import type { TransferInput } from '@shared/schemas.ts'
import type { AccountBalance, TransferRow } from '@shared/types.ts'

interface ListParams extends Record<string, unknown> {
  month?: string
  from?: string
  to?: string
  accountId?: string
  search?: string
  limit?: number
  offset?: number
  sort?: string
  dir?: string
}

export function useTransfers(params: ListParams) {
  return useQuery({
    queryKey: queryKeys.transfers(params),
    queryFn: () => api.transfers.list(params),
    // Paging and sorting fork the query key; without this the table empties to
    // a skeleton on every step instead of holding the rows it already has.
    placeholderData: keepPreviousData,
  })
}

/** Both sides of a transfer render their account, so both are resolved from the
 *  accounts cache the pickers were filled from. */
function endpoints(queryClient: QueryClient, fromId: string, toId: string) {
  const accounts = queryClient
    .getQueriesData<AccountBalance[]>({ queryKey: ['accounts'] })
    .flatMap(([, rows]) => rows ?? [])
  const from = accounts.find((row) => row.id === fromId)
  const to = accounts.find((row) => row.id === toId)

  return {
    fromAccountName: from?.name ?? '',
    fromAccountIcon: from?.icon ?? 'wallet',
    toAccountName: to?.name ?? '',
    toAccountIcon: to?.icon ?? 'wallet',
  }
}

export function useCreateTransfer() {
  const queryClient = useQueryClient()

  const patch = useCallback(
    (rows: TransferRow[], input: TransferInput) => [
      {
        id: `optimistic-${crypto.randomUUID()}`,
        occurredOn: input.occurredOn,
        amountCents: input.amountCents,
        fromAccountId: input.fromAccountId,
        toAccountId: input.toAccountId,
        note: input.note ?? null,
        createdAt: new Date().toISOString(),
        ...endpoints(queryClient, input.fromAccountId, input.toAccountId),
      },
      ...rows,
    ],
    [queryClient],
  )

  return useMutation({
    mutationFn: (input: TransferInput) => api.transfers.create(input),
    ...useOptimisticPage<TransferRow, TransferInput>(['transfers'], patch),
  })
}

export function useUpdateTransfer() {
  const queryClient = useQueryClient()

  const patch = useCallback(
    (rows: TransferRow[], { id, input }: { id: string; input: Partial<TransferInput> }) =>
      rows.map((row) =>
        row.id === id
          ? {
              ...row,
              ...input,
              ...endpoints(
                queryClient,
                input.fromAccountId ?? row.fromAccountId,
                input.toAccountId ?? row.toAccountId,
              ),
            }
          : row,
      ),
    [queryClient],
  )

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<TransferInput> }) =>
      api.transfers.update(id, input),
    ...useOptimisticPage<TransferRow, { id: string; input: Partial<TransferInput> }>(
      ['transfers'],
      patch,
    ),
  })
}

export function useDeleteTransfer() {
  const patch = useCallback((rows: TransferRow[], id: string) => rows.filter((r) => r.id !== id), [])

  return useMutation({
    mutationFn: (id: string) => api.transfers.remove(id),
    ...useOptimisticPage<TransferRow, string>(['transfers'], patch),
  })
}
