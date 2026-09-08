import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { ledgerScopes } from '@/lib/queryKeys'

/**
 * A write to any ledger table moves balances, budgets and every chart, so
 * mutations settle by invalidating the whole ledger rather than guessing which
 * derived queries they touched.
 */
export function useLedgerInvalidation() {
  const queryClient = useQueryClient()

  return useCallback(() => {
    for (const scope of ledgerScopes) {
      void queryClient.invalidateQueries({ queryKey: scope })
    }
  }, [queryClient])
}
