import { motion } from 'motion/react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DitherField } from '@/components/brand/DitherField'
import { GridMark } from '@/components/brand/GridMark'
import { DURATION, EASE } from '@/lib/motion'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  secondaryLabel?: string
  onSecondary?: () => void
  size?: 'sm' | 'md'
  className?: string
  /** In place of the button row, for a CTA that isn't a plain click handler —
   *  the investments import button owns its own file input and toast. */
  children?: React.ReactNode
}

/*
 * One primitive behind every empty surface, so a brand-new ledger reads as
 * designed rather than broken. The outline mark is the guidelines' "empty
 * ledger" state: eight unfilled cells and the emerald total still waiting.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  size = 'md',
  className,
  children,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'relative isolate flex flex-1 flex-col items-center justify-center overflow-hidden rounded-xl px-6 text-center',
        size === 'md' ? 'gap-4 py-12' : 'gap-3 py-8',
        className,
      )}
    >
      {/* Faded from the bottom edge so the copy sits on clean ground. */}
      <DitherField
        origin={[0.5, 1.4]}
        radius={1.1}
        intensity={0.5}
        scale={1.4}
        className="opacity-30 [mask-image:linear-gradient(to_top,black_0%,black_18%,transparent_62%)]"
      />

      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATION.base, ease: EASE.out }}
        className="relative flex flex-col items-center gap-4"
      >
        <div className="relative grid size-14 place-items-center rounded-2xl border border-border bg-surface/80 backdrop-blur-sm">
          {Icon ? (
            <Icon className="size-5 text-muted-foreground" strokeWidth={1.75} />
          ) : (
            <GridMark size={22} variant="outline" filled={0} className="text-muted-foreground" />
          )}
        </div>

        <div className="flex max-w-[38ch] flex-col gap-1.5">
          <p className="heading-tight text-[15px] text-foreground">{title}</p>
          {description && (
            <p className="text-[13px] leading-relaxed text-muted-foreground">{description}</p>
          )}
        </div>

        {children ? (
          <div className="flex items-center gap-2">{children}</div>
        ) : (
          (actionLabel ?? secondaryLabel) && (
            <div className="flex items-center gap-2">
              {actionLabel && onAction && (
                <Button size="sm" onClick={onAction}>
                  {actionLabel}
                </Button>
              )}
              {secondaryLabel && onSecondary && (
                <Button size="sm" variant="ghost" onClick={onSecondary}>
                  {secondaryLabel}
                </Button>
              )}
            </div>
          )
        )}
      </motion.div>
    </div>
  )
}
