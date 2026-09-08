import { Pencil, Trash2, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ActionProps {
  icon: LucideIcon
  label: string
  onClick: () => void
  tone?: 'default' | 'destructive'
}

/*
 * On a pointer device the actions fade in with the row's hover, so a dense
 * table is a wall of figures rather than a wall of buttons. Everywhere else
 * they simply stay visible — see `.row-action`. They are real buttons in the
 * tab order either way, and focus reveals them.
 */
export function RowAction({ icon: Icon, label, onClick, tone = 'default' }: ActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'row-action grid size-7 place-items-center rounded-md border border-transparent text-muted-foreground',
        'transition-[opacity,color,border-color,background-color,scale] duration-150 ease-[var(--ease-out-brand)]',
        'active:scale-95',
        tone === 'destructive'
          ? 'hoverfine:border-destructive/40 hoverfine:bg-destructive/10 hoverfine:text-destructive'
          : 'hoverfine:border-border hoverfine:bg-surface hoverfine:text-foreground',
      )}
    >
      <Icon className="size-3.5" strokeWidth={1.75} />
    </button>
  )
}

export function RowActions({ onEdit, onDelete, deleteLabel = 'Delete' }: {
  onEdit: () => void
  onDelete: () => void
  deleteLabel?: string
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <RowAction icon={Pencil} label="Edit" onClick={onEdit} />
      <RowAction icon={Trash2} label={deleteLabel} onClick={onDelete} tone="destructive" />
    </div>
  )
}
