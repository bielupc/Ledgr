import { NavLink } from 'react-router'
import { motion } from 'motion/react'
import {
  ArrowLeftRight,
  ChartPie,
  Flag,
  LayoutDashboard,
  Moon,
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
import { useQuickActions } from '@/features/quick-actions/QuickActions'
import { useTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { springy } from '@/lib/motion'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { to: '/accounts', label: 'Accounts', icon: Wallet },
  { to: '/categories', label: 'Categories', icon: Tags },
  { to: '/budgets', label: 'Budgets', icon: Target },
  { to: '/goals', label: 'Goals', icon: Flag },
  { to: '/recurring', label: 'Recurring', icon: Repeat },
  { to: '/reports', label: 'Reports', icon: ChartPie },
  { to: '/investments', label: 'Investments', icon: TrendingUp },
  { to: '/agent', label: 'AI agent', icon: Sparkles },
  { to: '/integrations', label: 'Integrations', icon: Plug },
]

const ROW =
  'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium ' +
  'transition-[color,background-color,border-color,scale] duration-150 ' +
  'ease-[var(--ease-out-brand)] active:scale-[0.98]'

export function Sidebar() {
  const { theme, toggle } = useTheme()
  const { setCommandOpen, openTransaction } = useQuickActions()

  return (
    <aside className="flex w-[236px] shrink-0 flex-col gap-1 border-r border-border bg-surface/40 px-3 py-5">
      <div className="mb-5 flex items-center gap-2.5 px-2">
        <GridMark size={22} className="text-foreground" />
        <span className="display-tight text-[19px] tracking-[-0.045em]">Ledgr</span>
      </div>

      <Button className="h-9 w-full justify-center gap-1.5" onClick={() => openTransaction('expense')}>
        <Plus className="size-4" strokeWidth={2.25} />
        Add
      </Button>

      <button
        type="button"
        onClick={() => setCommandOpen(true)}
        className={cn(
          ROW,
          'mt-1.5 border border-border bg-surface/60 text-muted-foreground',
          'hover:border-border-strong hover:text-foreground',
        )}
      >
        <Search className="size-4" strokeWidth={2} />
        <span>Quick actions</span>
        <kbd className="tabular ml-auto rounded border border-border bg-background px-1.5 py-0.5 text-[10px] leading-none text-subtle-foreground">
          ⌘K
        </kbd>
      </button>

      <nav className="mt-5 flex flex-col gap-0.5">
        {NAV.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end}>
            {({ isActive }) => (
              <span
                className={cn(
                  ROW,
                  'relative',
                  isActive
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
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
                  className={cn(
                    'relative size-4 transition-colors',
                    isActive && 'text-accent-ink',
                  )}
                  strokeWidth={1.75}
                />
                <span className="relative">{item.label}</span>
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <button
        type="button"
        onClick={toggle}
        className={cn(
          ROW,
          'mt-auto text-muted-foreground hover:bg-card hover:text-foreground',
        )}
      >
        {theme === 'dark' ? (
          <Sun className="size-4" strokeWidth={1.75} />
        ) : (
          <Moon className="size-4" strokeWidth={1.75} />
        )}
        <span>{theme === 'dark' ? 'Light' : 'Dark'} theme</span>
      </button>
    </aside>
  )
}
