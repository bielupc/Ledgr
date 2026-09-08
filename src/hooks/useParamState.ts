import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

/** A single string in the URL, so the view it selects survives a reload and a
 *  link carries it. Falls back rather than throwing on an unknown value. */
export function useParamState<T extends string>(
  key: string,
  fallback: T,
  allowed: readonly T[],
): [T, (value: T) => void] {
  const [params, setParams] = useSearchParams()
  const raw = params.get(key) as T | null
  const value = raw && allowed.includes(raw) ? raw : fallback

  const set = useCallback(
    (next: T) => {
      setParams(
        (current) => {
          const updated = new URLSearchParams(current)
          if (next === fallback) updated.delete(key)
          else updated.set(key, next)
          return updated
        },
        { replace: true },
      )
    },
    [setParams, key, fallback],
  )

  return [value, set]
}
