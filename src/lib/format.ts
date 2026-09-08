import { format, parseISO } from 'date-fns'

/** Single currency by decision: everything is EUR. */
export const LOCALE = 'es-ES'
export const CURRENCY = 'EUR'

const currencyFormatter = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: CURRENCY,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const compactFormatter = new Intl.NumberFormat(LOCALE, {
  maximumFractionDigits: 1,
})

/* Intl's own compact notation spells this out in Spanish ("120 mil"), which is
 * far too wide for an axis tick. The magnitude suffix is set here while the
 * separators stay the locale's: "." for thousands, "," for cents. */
const MAGNITUDES = [
  { limit: 1e9, suffix: 'B' },
  { limit: 1e6, suffix: 'M' },
  { limit: 1e3, suffix: 'K' },
] as const

export function toCents(euros: number): number {
  return Math.round(euros * 100)
}

export function toEuros(cents: number): number {
  return cents / 100
}

export function formatEuro(cents: number): string {
  return currencyFormatter.format(cents / 100)
}

/** Bare magnitude, for point labels where the panel already establishes that
 *  everything on it is money and repeating "€" is only width. */
export function formatCompactAmount(cents: number): string {
  const euros = cents / 100
  const magnitude = MAGNITUDES.find((entry) => Math.abs(euros) >= entry.limit)
  const value = magnitude ? euros / magnitude.limit : euros
  return `${compactFormatter.format(value)}${magnitude?.suffix ?? ''}`
}

export function formatEuroCompact(cents: number): string {
  return `${formatCompactAmount(cents)}\u00a0€`
}

export function formatSigned(cents: number): string {
  return `${cents > 0 ? '+' : ''}${formatEuro(cents)}`
}

/**
 * Splits a formatted amount so the decimals can be dimmed, the way the brand
 * guidelines set figures. Derived from `formatToParts` rather than string
 * surgery, so it survives the locale's separator and symbol placement.
 */
export function splitAmount(cents: number): {
  sign: string
  whole: string
  fraction: string
  currency: string
  currencyFirst: boolean
} {
  const parts = currencyFormatter.formatToParts(cents / 100)
  const currencyIndex = parts.findIndex((p) => p.type === 'currency')

  let sign = ''
  let whole = ''
  let fraction = ''
  let currency = ''

  for (const part of parts) {
    switch (part.type) {
      case 'minusSign':
      case 'plusSign':
        sign = part.value
        break
      case 'currency':
        currency = part.value
        break
      case 'decimal':
      case 'fraction':
        fraction += part.value
        break
      // Literals only ever separate the number from the symbol; keeping them
      // would trail whitespace into the dimmed decimals.
      case 'literal':
        break
      default:
        whole += part.value
    }
  }

  return {
    sign,
    whole,
    fraction,
    currency,
    currencyFirst: currencyIndex !== -1 && currencyIndex === 0,
  }
}

export function formatDay(date: string): string {
  return format(parseISO(date), 'd MMM')
}

export function formatFullDay(date: string): string {
  return format(parseISO(date), 'd MMM yyyy')
}

export function formatMonthLabel(month: string): string {
  return format(parseISO(`${month}-01`), 'MMM yyyy')
}

export function formatMonthShort(month: string): string {
  return format(parseISO(`${month}-01`), 'MMM')
}

export function formatMonthLong(month: string): string {
  return format(parseISO(`${month}-01`), 'MMMM yyyy')
}

export function currentMonth(): string {
  return format(new Date(), 'yyyy-MM')
}

export function todayIso(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

/**
 * Net worth movement as a proportion. Shown instead of the absolute delta
 * because that figure equals the month's balance, which the stats row below
 * already states. Null when there is no prior value to divide by.
 */
export function formatPercentChange(current: number, previous: number): string | null {
  if (previous === 0) return null
  // es-ES separates the figure from the sign with a non-breaking space. Correct
  // typographically, but it reads as a gap in a tight metric, so it is removed.
  return new Intl.NumberFormat(LOCALE, {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: 'exceptZero',
  })
    .format((current - previous) / Math.abs(previous))
    .replace(/\s+%/, '%')
}

export function percent(part: number, whole: number): number {
  if (whole <= 0) return 0
  return Math.round((part / whole) * 100)
}
