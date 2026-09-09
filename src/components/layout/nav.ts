import {
  ArrowLeftRight,
  ChartPie,
  Flag,
  LayoutDashboard,
  Plug,
  Repeat,
  Sparkles,
  Tags,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: typeof LayoutDashboard
  end?: boolean
}

/* Lifted out of Sidebar so the rail and the phone's bottom bar read the same
   list. Two copies would drift the moment a route is added, and the bar picks
   its tabs out of this by path. */
export const NAV_GROUPS: NavItem[][] = [
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

/* The four the thumb gets, in bar order. Add sits between the second and third
   as a button rather than a route, so the bar reads Dashboard · Transactions ·
   [+] · Budgets · More. Everything else is a tap further away, in the More
   sheet — a phone is for entering an expense and checking it landed, not for
   managing categories. */
export const BOTTOM_TABS = ['/', '/transactions', '/budgets'] as const

const inBar = new Set<string>(BOTTOM_TABS)

/** Whatever the bottom bar does not show, the More sheet does. */
export const MORE_GROUPS: NavItem[][] = NAV_GROUPS.map((group) =>
  group.filter((item) => !inBar.has(item.to)),
).filter((group) => group.length > 0)

export const BAR_ITEMS: NavItem[] = BOTTOM_TABS.map(
  (to) => NAV_GROUPS.flat().find((item) => item.to === to)!,
)
