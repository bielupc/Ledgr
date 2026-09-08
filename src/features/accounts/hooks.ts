import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import { useLedgerInvalidation } from '@/features/ledger'
import type { AccountInput } from '@shared/schemas.ts'

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
  const invalidate = useLedgerInvalidation()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<AccountInput> }) =>
      api.accounts.update(id, input),
    onSuccess: invalidate,
  })
}

export function useDeleteAccount() {
  const invalidate = useLedgerInvalidation()
  return useMutation({
    mutationFn: (id: string) => api.accounts.remove(id),
    onSuccess: invalidate,
  })
}

export function useRestoreAccount() {
  const invalidate = useLedgerInvalidation()
  return useMutation({
    mutationFn: (id: string) => api.accounts.restore(id),
    onSuccess: invalidate,
  })
}
