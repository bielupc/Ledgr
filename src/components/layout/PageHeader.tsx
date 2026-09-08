import { motion } from 'motion/react'
import { fadeUp, transition } from '@/lib/motion'

/** The same header on every screen: what this is on the left, what you can do
 *  about it on the right. No subtitle slot — a line under a page title restates
 *  either the title or the control next to it. */
export function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <motion.header
      variants={fadeUp}
      transition={transition}
      className="flex flex-wrap items-center justify-between gap-3"
    >
      <h1 className="display-tight text-[21px]">{title}</h1>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </motion.header>
  )
}
