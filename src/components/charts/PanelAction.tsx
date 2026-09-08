import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/*
 * Pinned to the foot of a panel with mt-auto, so a list that is shorter than
 * its neighbour spends the slack on an affordance instead of on a ragged card
 * edge. Both panels in a row carry one, so it works whichever list is taller.
 */
export function PanelAction({
  icon: Icon,
  label,
  onClick,
  className,
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
  className?: string
}) {
  return (
    <div className={cn('mt-auto px-1 pt-2', className)}>
      <button
        type="button"
        onClick={onClick}
        className="group flex w-full items-center gap-2.5 rounded-lg border border-transparent px-2 py-2 text-[12.5px] text-subtle-foreground transition-[color,background-color,border-color,scale] duration-150 ease-[var(--ease-out-brand)] hoverfine:border-border hoverfine:bg-muted/60 hoverfine:text-foreground active:scale-[0.99]"
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-md border border-dashed border-border-strong transition-[border-color,scale] duration-150 ease-[var(--ease-out-brand)] group-hoverfine:scale-105 group-hoverfine:border-emerald/50">
          <Icon
            className="size-3.5 transition-colors duration-150 group-hoverfine:text-accent-ink"
            strokeWidth={1.75}
          />
        </span>
        {label}
      </button>
    </div>
  )
}
