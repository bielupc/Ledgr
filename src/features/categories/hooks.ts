import { useCallback } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import { useLedgerInvalidation, useOptimisticRows } from '@/features/ledger'
import type { CategoryInput, CategoryKind } from '@shared/schemas.ts'
import type { Category } from '@shared/types.ts'

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

type UpdateVars = { id: string; input: Partial<Omit<CategoryInput, 'kind'>> }

export function useUpdateCategory() {
  const patch = useCallback(
    (rows: Category[], { id, input }: UpdateVars) =>
      rows.map((row) => (row.id === id ? { ...row, ...input } : row)),
    [],
  )

  return useMutation({
    mutationFn: ({ id, input }: UpdateVars) => api.categories.update(id, input),
    ...useOptimisticRows<Category, UpdateVars>(['categories'], patch),
  })
}

export function useDeleteCategory() {
  const patch = useCallback(
    (rows: Category[], id: string) =>
      rows.map((row) => (row.id === id ? { ...row, deletedAt: new Date().toISOString() } : row)),
    [],
  )

  return useMutation({
    mutationFn: (id: string) => api.categories.remove(id),
    ...useOptimisticRows<Category, string>(['categories'], patch),
  })
}

export function useRestoreCategory() {
  const patch = useCallback(
    (rows: Category[], id: string) =>
      rows.map((row) => (row.id === id ? { ...row, deletedAt: null } : row)),
    [],
  )

  return useMutation({
    mutationFn: (id: string) => api.categories.restore(id),
    ...useOptimisticRows<Category, string>(['categories'], patch),
  })
}
