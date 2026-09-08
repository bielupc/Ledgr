import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import { useLedgerInvalidation } from '@/features/ledger'
import type { CategoryInput, CategoryKind } from '@shared/schemas.ts'

export function useCategories(params: { kind?: CategoryKind; includeDeleted?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.categories(params),
    queryFn: () => api.categories.list(params),
  })
}

export function useCreateCategory() {
  const invalidate = useLedgerInvalidation()
  return useMutation({
    mutationFn: (input: CategoryInput) => api.categories.create(input),
    onSuccess: invalidate,
  })
}

export function useUpdateCategory() {
  const invalidate = useLedgerInvalidation()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<Omit<CategoryInput, 'kind'>> }) =>
      api.categories.update(id, input),
    onSuccess: invalidate,
  })
}

export function useDeleteCategory() {
  const invalidate = useLedgerInvalidation()
  return useMutation({
    mutationFn: (id: string) => api.categories.remove(id),
    onSuccess: invalidate,
  })
}
