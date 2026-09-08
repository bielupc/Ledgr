import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import { useLedgerInvalidation } from '@/features/ledger'
import type { TransferInput } from '@shared/schemas.ts'
import type { TransferRow } from '@shared/types.ts'

export function useTransfers(params: { month?: string; accountId?: string; search?: string; limit?: number }) {
  return useQuery({
    queryKey: queryKeys.transfers(params),
    queryFn: () => api.transfers.list(params),
  })
}

export function useCreateTransfer() {
  const invalidate = useLedgerInvalidation()
  return useMutation({
    mutationFn: (input: TransferInput) => api.transfers.create(input),
    onSuccess: invalidate,
  })
}

export function useUpdateTransfer() {
  const invalidate = useLedgerInvalidation()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<TransferInput> }) =>
      api.transfers.update(id, input),
    onSuccess: invalidate,
  })
}

export function useDeleteTransfer() {
  const queryClient = useQueryClient()
  const invalidate = useLedgerInvalidation()

  return useMutation({
    mutationFn: (id: string) => api.transfers.remove(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['transfers'] })
      const previous = queryClient.getQueriesData<TransferRow[]>({ queryKey: ['transfers'] })
      queryClient.setQueriesData<TransferRow[]>({ queryKey: ['transfers'] }, (rows) =>
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
