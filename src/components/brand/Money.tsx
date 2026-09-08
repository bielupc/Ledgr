import { useEffect, useState } from 'react'
import NumberFlow from '@number-flow/react'
import { cn } from '@/lib/utils'
import { CURRENCY, LOCALE, splitAmount, toEuros } from '@/lib/format'

interface MoneyProps {
  cents: number
  /** Show an explicit + for positive values. */
  signed?: boolean
  /** Colour by direction rather than inheriting. */
  tone?: 'auto' | 'inherit' | 'positive' | 'negative'
  /**
   * Roll the digits when the value changes. For headline figures that are read
   * one at a time — a wall of animating numbers is noise, not polish.
   */
  animate?: boolean
  className?: string
  decimalClassName?: string
}

/*
 * Figures are DM Mono, and the decimals sit back so the magnitude reads first —
 * the treatment the guidelines use for the headline number.
 */
export function Money({
  cents,
  signed = false,
  tone = 'inherit',
  animate = false,
  className,
  decimalClassName,
}: MoneyProps) {
  const toneClass =
    tone === 'auto'
      ? cents > 0
        ? 'text-positive'
        : cents < 0
          ? 'text-negative'
          : undefined
      : tone === 'positive'
        ? 'text-positive'
        : tone === 'negative'
          ? 'text-negative'
          : undefined

  if (animate) {
    return <AnimatedMoney cents={cents} signed={signed} className={cn(toneClass, className)} />
  }

  const { sign, whole, fraction, currency, currencyFirst } = splitAmount(cents)
  const displaySign = signed && cents > 0 ? '+' : sign

  return (
    <span className={cn('tabular whitespace-nowrap', toneClass, className)}>
      {displaySign}
      {currencyFirst && <span className="opacity-45">{currency}&nbsp;</span>}
      {whole}
      <span className={cn('opacity-45', decimalClassName)}>{fraction}</span>
      {!currencyFirst && <span className="opacity-45">&nbsp;{currency}</span>}
    </span>
  )
}

function AnimatedMoney({
  cents,
  signed,
  className,
}: {
  cents: number
  signed: boolean
  className?: string
}) {
  // NumberFlow only animates a *change*, so the first paint holds zero and the
  // real figure lands a frame later — the figure counts up on arrival.
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setSettled(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <NumberFlow
      value={settled ? toEuros(cents) : 0}
      locales={LOCALE}
      format={{
        style: 'currency',
        currency: CURRENCY,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        signDisplay: signed ? 'exceptZero' : 'auto',
      }}
      /*
       * Counting up from zero adds seven digit slots, and by default each one
       * slides in horizontally and fades — two animations on top of the roll.
       * Zeroing those leaves the slots in place from the first frame, so the
       * only motion is the digits spinning. `spinTiming` has to be given
       * explicitly because it otherwise inherits `transformTiming`.
       */
      transformTiming={{ duration: 0 }}
      opacityTiming={{ duration: 0 }}
      spinTiming={{ duration: 700, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }}
      // Reserves its own width so a rolling figure cannot nudge its neighbours.
      isolate
      className={cn('money-flow tabular whitespace-nowrap', className)}
    />
  )
}
