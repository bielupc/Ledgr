import { useCallback } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import { useLedgerInvalidation, useOptimisticRows } from '@/features/ledger'
import type { RecurringRuleInput } from '@shared/schemas.ts'
import type { RecurringRuleRow } from '@shared/types.ts'

export function useRecurringRules() {
  return useQuery({
    queryKey: queryKeys.recurring(),
    queryFn: () => api.recurring.list(),
  })
}

export function useCreateRecurring() {
  const invalidate = useLedgerInvalidation()
  return useMutation({
    mutationFn: (input: RecurringRuleInput) => api.recurring.create(input),
    // A new rule may post immediately, so its transactions and the balances
    // they move have to be refetched along with the rule list.
    onSuccess: invalidate,
  })
}

type UpdateVars = { id: string; input: Partial<RecurringRuleInput> }

/**
 * Pausing is the frequent case and is a pure flag, so it patches cleanly.
 * A schedule edit re-anchors `nextRunOn` on the server, which is arithmetic the
 * client should not duplicate — the settle refetch brings back the real dates.
 */
export function useUpdateRecurring() {
  const patch = useCallback(
    (rows: RecurringRuleRow[], { id, input }: UpdateVars) =>
      rows.map((row) =>
        row.id === id
          ? { ...row, ...input, isActive: input.isActive === undefined ? row.isActive : input.isActive ? 1 : 0 }
          : row,
      ),
    [],
  )

  return useMutation({
    mutationFn: ({ id, input }: UpdateVars) => api.recurring.update(id, input),
    ...useOptimisticRows<RecurringRuleRow, UpdateVars>(['recurring'], patch),
  })
}

/** Stops future postings. Everything already posted stays in history, which is
 *  why the transactions list is left alone and only the rule leaves. */
export function useDeleteRecurring() {
  const patch = useCallback(
    (rows: RecurringRuleRow[], id: string) => rows.filter((row) => row.id !== id),
    [],
  )

  return useMutation({
    mutationFn: (id: string) => api.recurring.remove(id),
    ...useOptimisticRows<RecurringRuleRow, string>(['recurring'], patch),
  })
}
