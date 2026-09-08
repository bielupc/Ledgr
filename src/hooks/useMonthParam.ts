import { useCallback } from 'react'
import { useSearchParams } from 'react-router'
import { currentMonth } from '@/lib/format'

const VALID = /^\d{4}-\d{2}$/

/** The selected month lives in the URL so a view can be linked and restored. */
export function useMonthParam(): [string, (month: string) => void] {
  const [params, setParams] = useSearchParams()
  const raw = params.get('month')
  const month = raw && VALID.test(raw) ? raw : currentMonth()

  const setMonth = useCallback(
    (next: string) => {
      setParams(
        (current) => {
          const updated = new URLSearchParams(current)
          if (next === currentMonth()) updated.delete('month')
          else updated.set('month', next)
          return updated
        },
        { replace: true },
      )
    },
    [setParams],
  )

  return [month, setMonth]
}
