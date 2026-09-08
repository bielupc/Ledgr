import { motion } from 'motion/react'
import { cn } from '@/lib/utils'
import { DURATION, EASE } from '@/lib/motion'

/*
 * The Grid, per the brand guidelines: cell = 5 units, gap = 1 unit,
 * radius = 1 unit, and the bottom-right cell is always Emerald — that is where
 * a total lives. Never scaled non-uniformly, never a tenth cell.
 */
const CELL = 5
const GAP = 1
const SPAN = CELL * 3 + GAP * 2

interface GridMarkProps {
  size?: number
  variant?: 'solid' | 'outline'
  /** How many of the nine cells are filled; the rest sit at low opacity. */
  filled?: number
  animate?: boolean
  className?: string
}

export function GridMark({
  size = 24,
  variant = 'solid',
  filled = 9,
  animate = false,
  className,
}: GridMarkProps) {
  const unit = size / SPAN
  const cell = unit * CELL
  const gap = unit * GAP
  const radius = Math.max(1, unit)

  return (
    <div
      className={cn('grid shrink-0', className)}
      style={{
        gridTemplateColumns: `repeat(3, ${cell}px)`,
        gridAutoRows: `${cell}px`,
        gap: `${gap}px`,
      }}
      aria-hidden
    >
      {Array.from({ length: 9 }, (_, index) => {
        const isLast = index === 8
        const isFilled = index < filled
        const Cell = animate ? motion.div : 'div'

        return (
          <Cell
            key={index}
            style={{
              borderRadius: radius,
              background: isLast
                ? 'var(--emerald)'
                : variant === 'outline'
                  ? 'transparent'
                  : 'currentColor',
              border:
                variant === 'outline' && !isLast
                  ? `${Math.max(1, unit * 0.6)}px solid currentColor`
                  : undefined,
              opacity: isFilled ? 1 : 0.22,
            }}
            {...(animate
              ? {
                  initial: { opacity: 0, scale: 0.6 },
                  animate: { opacity: isFilled ? 1 : 0.22, scale: 1 },
                  transition: {
                    duration: DURATION.fast,
                    ease: EASE.out,
                    delay: index * 0.035,
                  },
                }
              : {})}
          />
        )
      })}
    </div>
  )
}

/** Loading indicator: cells fill in reading order, then reset. */
export function GridMarkPulse({ size = 24, className }: { size?: number; className?: string }) {
  const unit = size / SPAN
  const cell = unit * CELL
  const gap = unit * GAP

  return (
    <div
      className={cn('grid shrink-0', className)}
      style={{
        gridTemplateColumns: `repeat(3, ${cell}px)`,
        gridAutoRows: `${cell}px`,
        gap: `${gap}px`,
      }}
      role="status"
      aria-label="Loading"
    >
      {Array.from({ length: 9 }, (_, index) => (
        <motion.div
          key={index}
          style={{
            borderRadius: Math.max(1, unit),
            background: index === 8 ? 'var(--emerald)' : 'currentColor',
          }}
          animate={{ opacity: [0.18, 1, 0.18] }}
          transition={{
            duration: 1.1,
            ease: EASE.inOut,
            repeat: Infinity,
            delay: index * 0.07,
          }}
        />
      ))}
    </div>
  )
}
