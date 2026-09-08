import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

/** Radix cannot hold an empty string as a value, so "no filter" needs a name. */
export const ANY = 'any'

export interface Filters {
  search: string
  accountId: string
  categoryId: string
}

/*
 * Filters live in the URL next to `month`, so a filtered view is a link: the
 * back button steps through them and a reload lands where you were.
 */
export function useFilters(): [Filters, (patch: Partial<Filters>) => void, boolean] {
  const [params, setParams] = useSearchParams()

  const filters: Filters = {
    search: params.get('q') ?? '',
    accountId: params.get('account') ?? ANY,
    categoryId: params.get('category') ?? ANY,
  }

  const set = useCallback(
    (patch: Partial<Filters>) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          const write = (key: string, value: string | undefined, empty: string) => {
            if (value === undefined) return
            if (value === empty) next.delete(key)
            else next.set(key, value)
          }
          write('q', patch.search, '')
          write('account', patch.accountId, ANY)
          write('category', patch.categoryId, ANY)
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )

  const active =
    filters.search !== '' || filters.accountId !== ANY || filters.categoryId !== ANY

  return [filters, set, active]
}
