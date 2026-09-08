import { useQueryClient, type QueryKey } from '@tanstack/react-query'
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

export interface RollbackContext<Row> {
  previous: [QueryKey, Row[] | undefined][]
}

/**
 * The optimistic half of a ledger mutation, written once.
 *
 * Every cached list under `scope` is snapshotted, patched, and put back
 * untouched if the write fails — the same three callbacks for a create, an
 * edit, an archive or a delete, since only the patch differs. Settling always
 * invalidates: the optimistic row is a stand-in for the server's, never a
 * replacement for it.
 */
export function useOptimisticRows<Row, Variables>(
  scope: QueryKey,
  patch: (rows: Row[], variables: Variables) => Row[],
) {
  const queryClient = useQueryClient()
  const invalidate = useLedgerInvalidation()

  const onMutate = useCallback(
    async (variables: Variables): Promise<RollbackContext<Row>> => {
      // Without this an in-flight refetch can land after the patch and undo it.
      await queryClient.cancelQueries({ queryKey: scope })
      const previous = queryClient.getQueriesData<Row[]>({ queryKey: scope })
      queryClient.setQueriesData<Row[]>({ queryKey: scope }, (rows) =>
        rows ? patch(rows, variables) : rows,
      )
      return { previous }
    },
    [queryClient, scope, patch],
  )

  const onError = useCallback(
    (_error: Error, _variables: Variables, context: RollbackContext<Row> | undefined) => {
      context?.previous.forEach(([key, rows]) => queryClient.setQueryData(key, rows))
    },
    [queryClient],
  )

  return { onMutate, onError, onSettled: invalidate }
}
