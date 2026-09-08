import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import { useLedgerInvalidation } from '@/features/ledger'
import type { TransactionInput } from '@shared/schemas.ts'
import type { TransactionRow } from '@shared/types.ts'

interface ListParams extends Record<string, unknown> {
  month?: string
  kind?: string
  accountId?: string
  categoryId?: string
  search?: string
  limit?: number
}

export function useTransactions(params: ListParams) {
  return useQuery({
    queryKey: queryKeys.transactions(params),
    queryFn: () => api.transactions.list(params),
  })
}

/**
 * Optimistic insert: the row lands in every cached transaction list it belongs
 * to before the request resolves, so the ledger reacts instantly.
 */
export function useCreateTransaction() {
  const queryClient = useQueryClient()
  const invalidate = useLedgerInvalidation()

  return useMutation({
    mutationFn: (input: TransactionInput) => api.transactions.create(input),

    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ['transactions'] })
      const previous = queryClient.getQueriesData<TransactionRow[]>({
        queryKey: ['transactions'],
      })

      const optimistic: TransactionRow = {
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
        accountName: '',
        accountIcon: 'wallet',
        categoryName: null,
        categoryIcon: null,
        categoryColor: null,
      }

      queryClient.setQueriesData<TransactionRow[]>({ queryKey: ['transactions'] }, (rows) =>
        rows ? [optimistic, ...rows] : rows,
      )

      return { previous }
    },

    onError: (_error, _input, context) => {
      context?.previous.forEach(([key, rows]) => queryClient.setQueryData(key, rows))
    },

    onSettled: invalidate,
  })
}

export function useUpdateTransaction() {
  const invalidate = useLedgerInvalidation()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<TransactionInput> }) =>
      api.transactions.update(id, input),
    onSuccess: invalidate,
  })
}

export function useDeleteTransaction() {
  const queryClient = useQueryClient()
  const invalidate = useLedgerInvalidation()

  return useMutation({
    mutationFn: (id: string) => api.transactions.remove(id),

    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['transactions'] })
      const previous = queryClient.getQueriesData<TransactionRow[]>({
        queryKey: ['transactions'],
      })
      queryClient.setQueriesData<TransactionRow[]>({ queryKey: ['transactions'] }, (rows) =>
        rows?.filter((row) => row.id !== id),
      )
      return { previous }
    },

    onError: (_error, _id, context) => {
      context?.previous.forEach(([key, rows]) => queryClient.setQueryData(key, rows))
    },

    onSettled: invalidate,
  })
}
