import { useEffect, useState } from 'react'
import { useTheme } from '@/lib/theme'

/**
 * Resolves design tokens to concrete colours for canvas/SVG renderers, which
 * cannot consume CSS custom properties.
 *
 * `getPropertyValue` hands back the *specified* value, so a token declared as
 * `color-mix(…)` arrives as that literal string. zrender parses every colour it
 * is asked to animate, parses that one to undefined, and then throws on every
 * frame. Painting the token onto a probe element makes the browser do the
 * resolution and yields a plain `rgb()`/`rgba()`.
 */
export function useResolvedTokens(names: string[]): Record<string, string> {
  const { theme } = useTheme()
  const [tokens, setTokens] = useState<Record<string, string>>({})
  const key = names.join(',')

  useEffect(() => {
    const styles = getComputedStyle(document.documentElement)
    const probe = document.createElement('span')
    probe.style.display = 'none'
    document.documentElement.append(probe)

    const next: Record<string, string> = {}
    for (const name of key.split(',')) {
      const declared = styles.getPropertyValue(name).trim()
      if (!declared) continue
      probe.style.color = `var(${name})`
      next[name] = getComputedStyle(probe).color || declared
    }

    probe.remove()
    setTokens(next)
  }, [key, theme])

  return tokens
}
