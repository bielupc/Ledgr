import { allocateCells } from '@/lib/allocate'
import { cn } from '@/lib/utils'

export interface ShareSegment {
  id: string
  /** A CSS colour. Sequential by rank, so the block reads dark to light. */
  tone: string
  value: number
}

interface ShareGridProps {
  segments: ShareSegment[]
  /** 50 x 2 rows = 100, so one cell is exactly one percent. */
  columns?: number
  rows?: number
  activeId?: string | null
  onActive?: (id: string | null) => void
  className?: string
}

/*
 * A part-to-whole band built out of the brand's own cells: 100 of them, so a
 * cell is a percent and the figure beside a row is its cell count rather than a
 * second rounding of the same number that can disagree by a point.
 *
 * This is the encoding a run of cells cannot give. Measuring each account
 * against the largest one ranks them; it says nothing about how the whole
 * divides, which is the actual question. Two rows rather than four keeps the
 * saturated area near the brand's 4% budget.
 */
export function ShareGrid({
  segments,
  columns = 50,
  rows = 2,
  activeId,
  onActive,
  className,
}: ShareGridProps) {
  const budget = columns * rows
  const counts = allocateCells(
    segments.map((segment) => segment.value),
    budget,
  )

  const cells = segments.flatMap((segment, segmentIndex) =>
    Array.from({ length: counts[segmentIndex]! }, () => segment),
  )
  const empty = Math.max(0, budget - cells.length)

  return (
    <div
      className={cn('share-grid', className)}
      data-inspecting={activeId ? '' : undefined}
      style={{ gridTemplateRows: `repeat(${rows}, auto)` }}
      onMouseLeave={() => onActive?.(null)}
      aria-hidden
    >
      {cells.map((segment, index) => (
        <span
          key={index}
          data-dim={activeId && activeId !== segment.id ? '' : undefined}
          onMouseEnter={() => onActive?.(segment.id)}
          style={{ '--seg': segment.tone, '--i': index } as React.CSSProperties}
        />
      ))}
      {/* Only reachable with no balances at all; the panel shows its empty
          state before that, so this keeps the block square rather than short. */}
      {Array.from({ length: empty }, (_, index) => (
        <span key={`empty-${index}`} data-empty="" style={{ '--i': cells.length + index } as React.CSSProperties} />
      ))}
    </div>
  )
}
