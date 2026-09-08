import { createElement } from 'react'
import { resolveIcon } from '@/lib/icons'

/*
 * An icon chosen by name at a component's top level. `createElement` rather
 * than a capitalised local, which reads as defining a component inside render;
 * `resolveIcon` only looks a reference up.
 */
export function DynamicIcon({
  name,
  className,
  strokeWidth = 1.75,
}: {
  name: string | null | undefined
  className?: string
  strokeWidth?: number
}) {
  return createElement(resolveIcon(name), { className, strokeWidth })
}
