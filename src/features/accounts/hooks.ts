import { useCallback } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import { useLedgerInvalidation, useOptimisticRows } from '@/features/ledger'
import type { AccountInput } from '@shared/schemas.ts'
import type { AccountBalance } from '@shared/types.ts'

export function useAccounts(includeDeleted = false) {
  return useQuery({
    queryKey: queryKeys.accounts(includeDeleted),
    queryFn: () => api.accounts.list(includeDeleted),
  })
}

export function useCreateAccount() {
  const invalidate = useLedgerInvalidation()
  return useMutation({
    mutationFn: (input: AccountInput) => api.accounts.create(input),
    onSuccess: invalidate,
  })
}

export function useUpdateAccount() {
  const patch = useCallback(
    (rows: AccountBalance[], { id, input }: { id: string; input: Partial<AccountInput> }) =>
      rows.map((row) => {
        if (row.id !== id) return row
        // The opening balance is a term in the current balance, so editing it
        // has to move the balance by the same amount or the row contradicts
        // itself until the refetch lands.
        const opening = input.initialBalanceCents ?? row.initialBalanceCents
        return {
          ...row,
          ...input,
          initialBalanceCents: opening,
          balanceCents: row.balanceCents + (opening - row.initialBalanceCents),
        }
      }),
    [],
  )

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<AccountInput> }) =>
      api.accounts.update(id, input),
    ...useOptimisticRows<AccountBalance, { id: string; input: Partial<AccountInput> }>(
      ['accounts'],
      patch,
    ),
  })
}

/** Soft delete: the row leaves the live list, and the archived list it moves to
 *  is refetched by the invalidation that settles the write. */
export function useDeleteAccount() {
  const patch = useCallback(
    (rows: AccountBalance[], id: string) =>
      rows.map((row) => (row.id === id ? { ...row, deletedAt: new Date().toISOString() } : row)),
    [],
  )

  return useMutation({
    mutationFn: (id: string) => api.accounts.remove(id),
    ...useOptimisticRows<AccountBalance, string>(['accounts'], patch),
  })
}

export function useRestoreAccount() {
  const patch = useCallback(
    (rows: AccountBalance[], id: string) =>
      rows.map((row) => (row.id === id ? { ...row, deletedAt: null } : row)),
    [],
  )

  return useMutation({
    mutationFn: (id: string) => api.accounts.restore(id),
    ...useOptimisticRows<AccountBalance, string>(['accounts'], patch),
  })
}
