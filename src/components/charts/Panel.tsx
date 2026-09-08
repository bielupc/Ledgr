import { motion } from 'motion/react'
import { cn } from '@/lib/utils'
import { fadeUp, transition } from '@/lib/motion'
import { GridMarkPulse } from '@/components/brand/GridMark'

interface PanelProps {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  bodyClassName?: string
}

export function Panel({ title, action, children, className, bodyClassName }: PanelProps) {
  return (
    <motion.section
      variants={fadeUp}
      transition={transition}
      className={cn(
        'flex flex-col overflow-hidden rounded-xl border border-border bg-card',
        className,
      )}
    >
      <header className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-2">
        <h2 className="heading-tight text-[13.5px]">{title}</h2>
        {action}
      </header>
      <div className={cn('relative isolate flex flex-1 flex-col px-2 pb-2', bodyClassName)}>
        {children}
      </div>
    </motion.section>
  )
}

export function PanelLoading({ height = 240 }: { height?: number }) {
  return (
    <div className="flex items-center justify-center" style={{ height }}>
      <GridMarkPulse size={22} className="text-muted-foreground" />
    </div>
  )
}
