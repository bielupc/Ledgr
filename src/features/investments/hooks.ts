import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import type { BrokerOrderInput, FundPatchInput, TargetsInput } from '@shared/schemas.ts'

/**
 * A narrower version of `useLedgerInvalidation`: a portfolio write touches
 * the investments screen itself, the linked account's balance and net
 * worth — but never the transaction, transfer, budget or recurring lists an
 * ordinary ledger write does, so it stays a separate scope rather than
 * riding the full ledger invalidation and refetching things that can't have
 * changed.
 */
function useInvestmentsInvalidation() {
  const queryClient = useQueryClient()
  return useCallback(() => {
    for (const scope of [['investments'], ['accounts'], ['analytics']] as const) {
      void queryClient.invalidateQueries({ queryKey: scope })
    }
  }, [queryClient])
}

export function usePortfolioSummary() {
  return useQuery({
    queryKey: queryKeys.investments.summary(),
    queryFn: () => api.investments.summary(),
  })
}

export function useHoldings() {
  return useQuery({
    queryKey: queryKeys.investments.holdings(),
    queryFn: () => api.investments.holdings(),
  })
}

export function usePortfolioSeries() {
  return useQuery({
    queryKey: queryKeys.investments.series(),
    queryFn: () => api.investments.series(),
  })
}

export function useContributions() {
  return useQuery({
    queryKey: queryKeys.investments.contributions(),
    queryFn: () => api.investments.contributions(),
  })
}

export function useFunds() {
  return useQuery({ queryKey: queryKeys.investments.funds(), queryFn: () => api.investments.funds() })
}

export function useFundPrices(isin: string | null) {
  return useQuery({
    queryKey: queryKeys.investments.fundPrices(isin ?? ''),
    queryFn: () => api.investments.fundPrices(isin!),
    enabled: Boolean(isin),
  })
}

export function useOrders() {
  return useQuery({ queryKey: queryKeys.investments.orders(), queryFn: () => api.investments.orders() })
}

export function useImportOrders() {
  const invalidate = useInvestmentsInvalidation()
  return useMutation({
    mutationFn: (orders: BrokerOrderInput[]) => api.investments.importOrders(orders),
    onSuccess: invalidate,
  })
}

export function useSetTargets() {
  const invalidate = useInvestmentsInvalidation()
  return useMutation({
    mutationFn: (input: TargetsInput) => api.investments.setTargets(input),
    onSuccess: invalidate,
  })
}

export function useUpdateFund() {
  const invalidate = useInvestmentsInvalidation()
  return useMutation({
    mutationFn: ({ isin, input }: { isin: string; input: FundPatchInput }) =>
      api.investments.updateFund(isin, input),
    onSuccess: invalidate,
  })
}

export function useRefreshPrices() {
  const invalidate = useInvestmentsInvalidation()
  return useMutation({
    mutationFn: () => api.investments.refreshPrices(),
    onSuccess: invalidate,
  })
}
