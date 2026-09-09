import { useQueryClient, type QueryKey } from '@tanstack/react-query'
import { useCallback } from 'react'
import { ledgerScopes } from '@/lib/queryKeys'
import type { Page } from '@shared/types.ts'

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

export interface RollbackContext<Cached> {
  previous: [QueryKey, Cached | undefined][]
}

/**
 * Snapshot every cached entry under `scope`, patch it, and put it back
 * untouched if the write fails. Settling always invalidates: the optimistic
 * value is a stand-in for the server's, never a replacement for it.
 */
function useOptimisticCache<Cached, Variables>(
  scope: QueryKey,
  patch: (cached: Cached, variables: Variables) => Cached,
) {
  const queryClient = useQueryClient()
  const invalidate = useLedgerInvalidation()

  const onMutate = useCallback(
    async (variables: Variables): Promise<RollbackContext<Cached>> => {
      // Without this an in-flight refetch can land after the patch and undo it.
      await queryClient.cancelQueries({ queryKey: scope })
      const previous = queryClient.getQueriesData<Cached>({ queryKey: scope })
      queryClient.setQueriesData<Cached>({ queryKey: scope }, (cached) =>
        cached ? patch(cached, variables) : cached,
      )
      return { previous }
    },
    [queryClient, scope, patch],
  )

  const onError = useCallback(
    (_error: Error, _variables: Variables, context: RollbackContext<Cached> | undefined) => {
      context?.previous.forEach(([key, cached]) => queryClient.setQueryData(key, cached))
    },
    [queryClient],
  )

  return { onMutate, onError, onSettled: invalidate }
}

/**
 * The optimistic half of a ledger mutation over a plain array cache — the same
 * three callbacks for a create, an edit, an archive or a delete, since only the
 * patch differs.
 */
export function useOptimisticRows<Row, Variables>(
  scope: QueryKey,
  patch: (rows: Row[], variables: Variables) => Row[],
) {
  return useOptimisticCache<Row[], Variables>(scope, patch)
}

/**
 * The same, for a paginated list. The caller writes one row patch and it is
 * lifted over `page.rows`; `total` follows the row-count delta so the footer
 * does not lag a create by a whole round-trip.
 *
 * `totalCents` is deliberately left alone. Correcting it optimistically would
 * mean every mutation handing over a signed amount delta, and `onSettled`
 * refetches the true figure a moment later either way.
 */
export function useOptimisticPage<Row, Variables>(
  scope: QueryKey,
  patch: (rows: Row[], variables: Variables) => Row[],
) {
  const patchPage = useCallback(
    (page: Page<Row>, variables: Variables): Page<Row> => {
      const rows = patch(page.rows, variables)
      return { ...page, rows, total: page.total + (rows.length - page.rows.length) }
    },
    [patch],
  )

  return useOptimisticCache<Page<Row>, Variables>(scope, patchPage)
}
