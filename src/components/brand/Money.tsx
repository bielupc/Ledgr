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
  /** Set false to butt the € directly against the figure — a tight inline
   *  read (e.g. "+2410,14€") rather than the spaced full-amount treatment.
   *  Has no effect with `animate`: NumberFlow's own currency formatting
   *  keeps its spacing regardless. */
  spaced?: boolean
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
  spaced = true,
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
      {currencyFirst && (
        <span className="opacity-45">
          {currency}
          {spaced && ' '}
        </span>
      )}
      {whole}
      <span className={cn('opacity-45', decimalClassName)}>{fraction}</span>
      {!currencyFirst && (
        <span className="opacity-45">
          {spaced && ' '}
          {currency}
        </span>
      )}
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
  // real figure lands a frame later — the figure counts up on arrival. A figure
  // that already starts at zero has nothing to count up to, so it skips the
  // deferral: the keypad opens at zero and would otherwise spend an animation
  // pass going nowhere on every open.
  const [settled, setSettled] = useState(() => cents === 0)
  useEffect(() => {
    if (settled) return
    const frame = requestAnimationFrame(() => setSettled(true))
    return () => cancelAnimationFrame(frame)
  }, [settled])

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
      /*
       * 180ms, not 700. At 700 the roll was smooth but sluggish — a figure the
       * eye waits on for the better part of a second reads as the app being
       * slow, which is the same complaint as dropped frames from the other end.
       * This keeps it inside the sub-300ms band the rest of the app animates in.
       */
      spinTiming={{ duration: 180, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }}
      // Reserves its own width so a rolling figure cannot nudge its neighbours.
      isolate
      className={cn('money-flow tabular whitespace-nowrap', className)}
    />
  )
}
