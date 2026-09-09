import { useEffect, useState } from 'react'

/** The same query behind the `hoverfine` Tailwind variant, in JS. */
const QUERY = '(hover: hover) and (pointer: fine)'

/**
 * True for a mouse or trackpad, false for touch. Chart tooltips key off this
 * rather than a width breakpoint: on a touch screen there is no hover, so the
 * gesture that would open a tooltip is the same one used to scroll past the
 * chart, and the tooltip fires on every swipe.
 */
export function useFinePointer(): boolean {
  const [fine, setFine] = useState(
    () => typeof window === 'undefined' || window.matchMedia(QUERY).matches,
  )

  useEffect(() => {
    const media = window.matchMedia(QUERY)
    const onChange = () => setFine(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  return fine
}
