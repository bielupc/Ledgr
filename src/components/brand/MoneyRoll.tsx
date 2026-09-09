import { formatEuro, splitAmount } from '@/lib/format'
import { cn } from '@/lib/utils'

/* Built once. Every column holds the same ten glyphs, so sharing the elements
   lets React skip the subtree entirely when a column rolls — only the parent's
   transform changes, which is the whole point of doing it this way. */
const COLUMN = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
  <span key={digit}>{digit}</span>
))

/*
 * The rolling figure for the keypad, written by hand rather than taken from
 * NumberFlow. NumberFlow measures every digit box with getBoundingClientRect
 * on each update, which a figure being *typed* pays on every keystroke: on a
 * 4x-throttled phone profile that is a 111ms worst frame. It can afford that
 * where a figure arrives on its own; it cannot where a thumb is driving it.
 *
 * DM Mono is tabular, so every slot is already the same width and there is
 * nothing to measure. Each digit is a column of ten glyphs behind a 1em
 * window, moved by a transform — compositor work, no layout, no reads.
 *
 * Slots are keyed from the right, so they carry place value: typing a digit
 * shifts the figure left by one place and every column rolls up by one, which
 * is the cascade the roll is wanted for in the first place.
 */
export function MoneyRoll({
  cents,
  tone = 'inherit',
  className,
}: {
  cents: number
  tone?: 'auto' | 'inherit' | 'positive' | 'negative'
  className?: string
}) {
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

  const { sign, whole, fraction, currency, currencyFirst } = splitAmount(cents)
  const chars = [...`${sign}${whole}${fraction}`]
  // Where the figure stops reading as magnitude and starts reading as change.
  const dimFrom = sign.length + whole.length

  const symbol = (
    <Glyph key="currency" char={currencyFirst ? `${currency} ` : ` ${currency}`} dim />
  )

  return (
    <span className={cn('tabular whitespace-nowrap', toneClass, className)}>
      {/* Each column is ten glyphs deep, so the figure is spelled out once for
          a screen reader and the visual row is hidden from it. */}
      <span className="sr-only">{formatEuro(cents)}</span>
      <span aria-hidden className="inline-flex">
        {currencyFirst && symbol}
        {chars.map((char, index) => {
          const slot = chars.length - index
          const dim = index >= dimFrom
          return char >= '0' && char <= '9' ? (
            <Digit key={slot} value={Number(char)} dim={dim} />
          ) : (
            <Glyph key={slot} char={char} dim={dim} />
          )
        })}
        {!currencyFirst && symbol}
      </span>
    </span>
  )
}

function Digit({ value, dim }: { value: number; dim: boolean }) {
  return (
    <span className={cn('digit-roll', dim && 'opacity-45')}>
      <span style={{ transform: `translateY(${-value * 10}%)` }}>{COLUMN}</span>
    </span>
  )
}

function Glyph({ char, dim }: { char: string; dim: boolean }) {
  return (
    <span className={cn('inline-block h-[1em] leading-none', dim && 'opacity-45')}>{char}</span>
  )
}
