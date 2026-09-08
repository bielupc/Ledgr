import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'

export function useSummary(month: string) {
  return useQuery({
    queryKey: queryKeys.summary(month),
    queryFn: () => api.analytics.summary(month),
  })
}

export function useNetWorthSeries() {
  return useQuery({ queryKey: queryKeys.netWorth(), queryFn: () => api.analytics.netWorth() })
}

export function useMonthlyTotals(month: string, months = 12) {
  return useQuery({
    queryKey: queryKeys.monthly(month, months),
    queryFn: () => api.analytics.monthly(month, months),
  })
}

export function useCategoryTotals(month: string, kind: 'expense' | 'income') {
  return useQuery({
    queryKey: queryKeys.byCategory(month, kind),
    queryFn: () => api.analytics.byCategory(month, kind),
  })
}

export function useBudgetStatus(month: string) {
  return useQuery({
    queryKey: queryKeys.budgetStatus(month),
    queryFn: () => api.analytics.budgetStatus(month),
  })
}
