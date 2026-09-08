import { useCallback } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import { currentMonth } from '@/lib/format'
import { useOptimisticRows } from '@/features/ledger'
import type { BudgetInput } from '@shared/schemas.ts'
import type { BudgetStatus } from '@shared/types.ts'

export function useBudgets(month: string) {
  return useQuery({
    queryKey: queryKeys.budgets(month),
    queryFn: () => api.budgets.list(month),
  })
}

/**
 * A limit is a standing figure on the category, not a row per month, so the
 * month in the request scopes only the `spentCents` the limits screen ignores.
 * The current month is the one asked for so this shares a cache entry with the
 * dashboard's budget panel instead of holding a second copy of the same rows.
 */
export function useBudgetLimits() {
  return useBudgets(currentMonth())
}

/**
 * One endpoint sets and changes a limit. A category that had none is not yet in
 * the cached list, so the patch appends it; the spend it already carries this
 * month arrives with the refetch.
 */
export function useSetBudget() {
  const patch = useCallback((rows: BudgetStatus[], input: BudgetInput) => {
    const existing = rows.find((row) => row.categoryId === input.categoryId)
    if (existing) {
      return rows.map((row) =>
        row.categoryId === input.categoryId ? { ...row, budgetCents: input.amountCents } : row,
      )
    }
    return [
      ...rows,
      {
        categoryId: input.categoryId,
        categoryName: '',
        categoryIcon: 'tag',
        categoryColor: null,
        budgetCents: input.amountCents,
        spentCents: 0,
      },
    ]
  }, [])

  return useMutation({
    mutationFn: (input: BudgetInput) => api.budgets.upsert(input),
    ...useOptimisticRows<BudgetStatus, BudgetInput>(['budgets'], patch),
  })
}

export function useClearBudget() {
  const patch = useCallback(
    (rows: BudgetStatus[], categoryId: string) =>
      rows.filter((row) => row.categoryId !== categoryId),
    [],
  )

  return useMutation({
    mutationFn: (categoryId: string) => api.budgets.remove(categoryId),
    ...useOptimisticRows<BudgetStatus, string>(['budgets'], patch),
  })
}
