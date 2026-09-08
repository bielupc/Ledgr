import { cn } from '@/lib/utils'

interface CellMeterProps {
  /** 0–1. Clamped; anything above 1 is the caller's cue to pass tone="negative". */
  fraction: number
  cells?: number
  tone?: 'emerald' | 'negative'
  /** Delays the whole run so a list of meters lands in sequence. */
  delayMs?: number
  className?: string
}

/*
 * The guidelines' progress language: "the grid doubles as UI — progress is
 * literally cells filling". Cell is 5 units, gap 1, radius 1, same ratio as the
 * mark, so a meter reads as a run of the logo rather than a bar.
 *
 * The leading cell carries full strength while the rest sit back, echoing the
 * mark's one emerald cell: the eye lands on where the run *ends*, which is the
 * value, instead of on the mass of the fill.
 */
export function CellMeter({
  fraction,
  cells = 16,
  tone = 'emerald',
  delayMs = 0,
  className,
}: CellMeterProps) {
  const clamped = Math.min(Math.max(fraction, 0), 1)
  // Any non-zero amount owes at least one cell; a balance that exists should
  // never render as an empty run.
  const filled = clamped === 0 ? 0 : Math.max(1, Math.round(clamped * cells))

  return (
    <span
      className={cn('cell-meter', className)}
      data-tone={tone}
      style={{ '--meter-delay': `${delayMs}ms` } as React.CSSProperties}
      aria-hidden
    >
      {Array.from({ length: cells }, (_, index) => (
        <span
          key={index}
          data-on={index < filled || undefined}
          data-lead={index === filled - 1 || undefined}
          style={{ '--i': index } as React.CSSProperties}
        />
      ))}
    </span>
  )
}
