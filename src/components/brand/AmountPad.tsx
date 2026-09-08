import { useEffect } from 'react'
import { Delete } from 'lucide-react'
import { Money } from '@/components/brand/Money'
import { MAX_AMOUNT_CENTS } from '@shared/schemas.ts'
import { cn } from '@/lib/utils'

/*
 * Cents-first entry: every keypress shifts digits in from the right, so 1-2-3-4
 * reads 0,01 then 0,12 then 1,23 then 12,34. That is what makes the figure move
 * rather than merely change, and it removes decimal-separator parsing entirely.
 *
 * Fully controlled on cents, so there is no digit-string to drift out of sync:
 * append is `cents * 10 + digit`, backspace is `floor(cents / 10)`.
 */
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'del'] as const

interface AmountPadProps {
  cents: number
  onChange: (cents: number) => void
  tone?: 'inherit' | 'positive' | 'negative'
}

export function AmountPad({ cents, onChange, tone = 'inherit' }: AmountPadProps) {
  const push = (key: (typeof KEYS)[number]) => {
    if (key === 'del') return onChange(Math.floor(cents / 10))
    const digits = key === '00' ? 2 : 1
    const next = cents * 10 ** digits + Number(key)
    if (next > MAX_AMOUNT_CENTS) return
    onChange(next)
  }

  // Desktop first: the pad is the affordance, the keyboard is the fast path.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      // The pad owns bare digits, but only while nothing else is taking text:
      // otherwise typing a name or stepping a date loses every keystroke.
      const target = event.target as HTMLElement | null
      if (target?.isContentEditable) return
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      if (/^[0-9]$/.test(event.key)) {
        event.preventDefault()
        push(event.key as (typeof KEYS)[number])
      } else if (event.key === 'Backspace') {
        event.preventDefault()
        push('del')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-[58px] items-center justify-center rounded-xl border border-border bg-surface/50">
        <Money
          cents={cents}
          animate
          tone={tone}
          className="money-hero display-tight text-[38px] leading-none"
        />
      </div>

      {/* Twelve keys in a 3x4 grid: no dead cell, and no decimal key, which
          cents-first entry has no use for. `00` takes that corner because it is
          the key round amounts actually want. */}
      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => push(key)}
            aria-label={key === 'del' ? 'Delete last digit' : key}
            className={cn(
              'grid h-[54px] place-items-center rounded-[10px] border border-border bg-surface/60 text-[20px] font-medium',
              'transition-[background-color,border-color,color,scale] duration-150 ease-[var(--ease-out-brand)]',
              'active:scale-[0.96] hoverfine:border-border-strong hoverfine:bg-card',
              key === 'del' ? 'text-muted-foreground' : 'tabular',
            )}
          >
            {key === 'del' ? <Delete className="size-5" strokeWidth={1.75} /> : key}
          </button>
        ))}
      </div>
    </div>
  )
}
