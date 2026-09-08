import { NavLink } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import {
  ArrowLeftRight,
  ChartPie,
  Flag,
  LayoutDashboard,
  Moon,
  PanelLeft,
  Plug,
  Plus,
  Repeat,
  Search,
  Sparkles,
  Sun,
  Tags,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { GridMark } from '@/components/brand/GridMark'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useQuickActions } from '@/features/quick-actions/QuickActions'
import { useTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { springy, transition } from '@/lib/motion'

const NAV_GROUPS = [
  [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/investments', label: 'Investments', icon: TrendingUp },
    { to: '/reports', label: 'Reports', icon: ChartPie },
  ],
  [
    { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
    { to: '/accounts', label: 'Accounts', icon: Wallet },
    { to: '/categories', label: 'Categories', icon: Tags },
    { to: '/recurring', label: 'Recurring', icon: Repeat },
  ],
  [
    { to: '/goals', label: 'Goals', icon: Flag },
    { to: '/budgets', label: 'Budgets', icon: Target },
  ],
  [
    { to: '/agent', label: 'AI agent', icon: Sparkles },
    { to: '/integrations', label: 'Integrations', icon: Plug },
  ],
]

/*
 * Collapsed width is not a taste call: rail padding (8) + row padding (10) +
 * icon (16) + row padding (10) + rail padding (8). Landing on it exactly means
 * every icon is already centred at rest, so collapsing never has to swap
 * padding or justification — it only animates width, and one continuously
 * interpolated property is what makes the motion read as smooth.
 */
const SIDEBAR_WIDTH = { expanded: 236, collapsed: 52 }

/** A label that shrinks its own width to zero and fades rather than
 *  vanishing outright, so it never pops mid-way through the rail's own
 *  width animation. */
function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.span
      initial={{ opacity: 0, width: 0 }}
      animate={{ opacity: 1, width: 'auto' }}
      exit={{ opacity: 0, width: 0 }}
      transition={transition}
      className={cn('overflow-hidden whitespace-nowrap', className)}
    >
      {children}
    </motion.span>
  )
}

/*
 * No border, no surface tint: the rail is the same ground as the page
 * behind it, so the only rounded, bordered surface on screen is the content
 * card sitting inset next to it. Collapsing narrows the rail to icons only;
 * the row order and group hairlines hold so a muscle-memory click still
 * lands on the same spot. The rail's width and every label animate on the
 * same transition so the collapse reads as one motion, not a width tween
 * with text popping in and out on top of it.
 */
export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { setCommandOpen, openTransaction } = useQuickActions()
  const { theme, toggle } = useTheme()

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? SIDEBAR_WIDTH.collapsed : SIDEBAR_WIDTH.expanded }}
      transition={transition}
      className="flex h-full shrink-0 flex-col gap-1 overflow-hidden px-2 py-4"
    >
      {/* Collapsed, the mark gives way to the control: at 52px there is only
          room for one, and losing the way back out would be worse. The
          toggle is exactly the collapsed content width, so `ml-auto` parks it
          right when open and dead centre when shut without a class swap.

          No `gap` on this row, and that is load-bearing. A flex gap is charged
          between items whatever their size, so it outlives the label's width
          animation right up to the unmount — and the last stretch of the
          collapse has no room to spare. Free space is
          `(width - padding) - label - button`, which with a gap ends at -10px:
          `ml-auto` runs out, the toggle is pushed past the rail edge, and it
          snaps back the frame the label unmounts. Without one it falls
          linearly to exactly zero, so the toggle tracks the edge the whole way
          and lands centred. Separation when open comes from `ml-auto`, which
          has ~87px to spend. */}
      <div className="mb-4 flex h-9 items-center">
        <AnimatePresence initial={false}>
          {!collapsed && (
            <Label key="brand" className="flex items-center gap-2.5">
              {/* Margin, not padding: it rides inside the clipped label so the
                  mark lines up with the nav icons below without leaving a
                  stub of width behind when the label collapses. */}
              <GridMark size={22} className="ml-2.5 shrink-0 text-foreground" />
              <span className="display-tight text-[19px] tracking-[-0.045em]">Ledgr</span>
            </Label>
          )}
        </AnimatePresence>

        <Button
          variant="ghost"
          size="icon"
          className="ml-auto size-9 shrink-0 text-muted-foreground"
          onClick={onToggle}
          title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          aria-pressed={collapsed}
        >
          <PanelLeft className="size-4" strokeWidth={1.75} />
        </Button>
      </div>

      <div className="flex flex-col gap-1.5">
        {/* The size variant carries `has-[>svg]:px-3`, and `:has()` outranks a
            plain `px-2.5` on specificity — so the override has to be stated in
            the same variant or the icon sits 2px off everything below it. */}
        <Button
          className="h-9 w-full justify-start gap-2.5 px-2.5 has-[>svg]:px-2.5"
          onClick={() => openTransaction('expense')}
          title={collapsed ? 'Add' : undefined}
        >
          <Plus className="size-4 shrink-0" strokeWidth={2.25} />
          <AnimatePresence initial={false}>
            {!collapsed && <Label key="add-label">Add</Label>}
          </AnimatePresence>
        </Button>

        <button
          type="button"
          onClick={() => setCommandOpen(true)}
          title="Quick actions (⌘K)"
          /* An inset ring rather than a border: it draws the same hairline as
             a box-shadow, so it costs no layout and the icon stays on the
             same axis as the borderless rows above and below it. */
          className="flex h-9 w-full items-center gap-2.5 rounded-lg bg-surface/60 px-2.5 text-[13px] font-medium text-muted-foreground inset-ring-1 inset-ring-border transition-colors duration-150 ease-[var(--ease-out-brand)] hoverfine:inset-ring-border-strong hoverfine:text-foreground"
        >
          <Search className="size-4 shrink-0" strokeWidth={2} />
          <AnimatePresence initial={false}>
            {!collapsed && (
              <Label key="quick-actions-label" className="flex flex-1 items-center gap-2">
                <span>Quick actions</span>
                <kbd className="tabular ml-auto rounded border border-border bg-background px-1.5 py-0.5 text-[10px] leading-none whitespace-nowrap text-subtle-foreground">
                  ⌘K
                </kbd>
              </Label>
            )}
          </AnimatePresence>
        </button>
      </div>

      <nav className="mt-4 flex flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden">
        {NAV_GROUPS.map((group, index) => (
          <div key={index} className="flex flex-col gap-0.5">
            {index > 0 && <Separator className="my-2" />}
            {group.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end}>
                {({ isActive }) => (
                  <span
                    className={cn(
                      'relative flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium',
                      'transition-[color,background-color] duration-150 ease-[var(--ease-out-brand)]',
                      isActive
                        ? 'text-foreground'
                        : 'text-muted-foreground hoverfine:bg-muted/60 hoverfine:text-foreground',
                    )}
                    title={collapsed ? item.label : undefined}
                  >
                    {isActive && (
                      // One shared layoutId gives the pill a single continuous
                      // motion between items instead of a fade per item.
                      <motion.span
                        layoutId="nav-active"
                        transition={springy}
                        className="absolute inset-0 rounded-lg border border-border bg-card"
                      />
                    )}
                    <item.icon
                      className={cn('relative size-4 shrink-0', isActive && 'text-accent-ink')}
                      strokeWidth={1.75}
                    />
                    <AnimatePresence initial={false}>
                      {!collapsed && <Label key={item.to} className="relative">{item.label}</Label>}
                    </AnimatePresence>
                  </span>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <button
        type="button"
        onClick={toggle}
        title={collapsed ? `${theme === 'dark' ? 'Light' : 'Dark'} theme` : undefined}
        className={cn(
          'flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium text-muted-foreground',
          'transition-[color,background-color] duration-150 ease-[var(--ease-out-brand)]',
          'hoverfine:bg-muted/60 hoverfine:text-foreground',
        )}
      >
        {theme === 'dark' ? (
          <Sun className="size-4 shrink-0" strokeWidth={1.75} />
        ) : (
          <Moon className="size-4 shrink-0" strokeWidth={1.75} />
        )}
        <AnimatePresence initial={false}>
          {!collapsed && (
            <Label key="theme-label">{theme === 'dark' ? 'Light' : 'Dark'} theme</Label>
          )}
        </AnimatePresence>
      </button>
    </motion.aside>
  )
}
