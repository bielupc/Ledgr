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
import type { TransactionInput } from '@shared/schemas.ts'
import type { AccountBalance, Category, TransactionRow } from '@shared/types.ts'

interface ListParams extends Record<string, unknown> {
  month?: string
  from?: string
  to?: string
  kind?: string
  accountId?: string
  categoryId?: string
  search?: string
  limit?: number
  offset?: number
  sort?: string
  dir?: string
}

export function useTransactions(params: ListParams) {
  return useQuery({
    queryKey: queryKeys.transactions(params),
    queryFn: () => api.transactions.list(params),
    // Paging and sorting fork the query key; without this the table empties to
    // a skeleton on every step instead of holding the rows it already has.
    placeholderData: keepPreviousData,
  })
}

/**
 * The names a row renders are joined on the server, so an optimistic row has to
 * find them itself. They are already in the cache — every picker that can
 * produce this write is fed by the same two queries — so the lookup is local
 * and the new row reads correctly instead of flashing a blank account.
 */
function joined(
  queryClient: QueryClient,
  ids: { accountId?: string | null; categoryId?: string | null },
) {
  const accounts = queryClient
    .getQueriesData<AccountBalance[]>({ queryKey: ['accounts'] })
    .flatMap(([, rows]) => rows ?? [])
  const categories = queryClient
    .getQueriesData<Category[]>({ queryKey: ['categories'] })
    .flatMap(([, rows]) => rows ?? [])

  const account = accounts.find((row) => row.id === ids.accountId)
  const category = categories.find((row) => row.id === ids.categoryId)

  return {
    accountName: account?.name ?? '',
    accountIcon: account?.icon ?? 'wallet',
    categoryName: category?.name ?? null,
    categoryIcon: category?.icon ?? null,
    categoryColor: category?.color ?? null,
  }
}

/**
 * Optimistic insert: the row lands in every cached transaction list it belongs
 * to before the request resolves, so the ledger reacts instantly.
 */
export function useCreateTransaction() {
  const queryClient = useQueryClient()

  const patch = useCallback(
    (rows: TransactionRow[], input: TransactionInput) => [
      {
        id: `optimistic-${crypto.randomUUID()}`,
        kind: input.kind,
        occurredOn: input.occurredOn,
        amountCents: input.amountCents,
        accountId: input.accountId,
        categoryId: input.categoryId ?? null,
        name: input.name ?? null,
        icon: input.icon ?? null,
        recurringRuleId: null,
        createdAt: new Date().toISOString(),
        ...joined(queryClient, input),
      },
      ...rows,
    ],
    [queryClient],
  )

  return useMutation({
    mutationFn: (input: TransactionInput) => api.transactions.create(input),
    ...useOptimisticPage<TransactionRow, TransactionInput>(['transactions'], patch),
  })
}

export function useUpdateTransaction() {
  const queryClient = useQueryClient()

  const patch = useCallback(
    (
      rows: TransactionRow[],
      { id, input }: { id: string; input: Partial<TransactionInput> },
    ) =>
      rows.map((row) =>
        row.id === id
          ? {
              ...row,
              ...input,
              ...joined(queryClient, {
                accountId: input.accountId ?? row.accountId,
                categoryId: 'categoryId' in input ? input.categoryId : row.categoryId,
              }),
            }
          : row,
      ),
    [queryClient],
  )

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<TransactionInput> }) =>
      api.transactions.update(id, input),
    ...useOptimisticPage<TransactionRow, { id: string; input: Partial<TransactionInput> }>(
      ['transactions'],
      patch,
    ),
  })
}

export function useDeleteTransaction() {
  const patch = useCallback(
    (rows: TransactionRow[], id: string) => rows.filter((row) => row.id !== id),
    [],
  )

  return useMutation({
    mutationFn: (id: string) => api.transactions.remove(id),
    ...useOptimisticPage<TransactionRow, string>(['transactions'], patch),
  })
}
