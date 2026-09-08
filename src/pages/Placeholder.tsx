import type { LucideIcon } from 'lucide-react'
import { EmptyState } from '@/components/empty/EmptyState'

/** Routes whose full screens land in the next pass. The shell, nav and command
 *  palette already reach them, so they should look intentional rather than 404. */
export function Placeholder({
  icon,
  title,
  description,
}: {
  icon: LucideIcon
  title: string
  description: string
}) {
  return (
    <div className="flex min-h-[420px] flex-col rounded-xl border border-border bg-card">
      <EmptyState icon={icon} title={title} description={description} />
    </div>
  )
}
