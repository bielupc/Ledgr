import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import {
  ArrowLeftRight,
  ChartPie,
  Flag,
  LayoutDashboard,
  Minus,
  Plug,
  Plus,
  RefreshCw,
  Repeat,
  Sparkles,
  Tags,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'
import { useQuickActions } from '@/features/quick-actions/QuickActions'
import { useLedgerInvalidation } from '@/features/ledger'
import { api } from '@/lib/api'

const DESTINATIONS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
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

export function CommandPalette() {
  const navigate = useNavigate()
  const invalidate = useLedgerInvalidation()
  const { commandOpen, setCommandOpen, openTransaction, openTransfer } = useQuickActions()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setCommandOpen(!commandOpen)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [commandOpen, setCommandOpen])

  const go = (to: string) => {
    setCommandOpen(false)
    void navigate(to)
  }

  return (
    <CommandDialog
      open={commandOpen}
      onOpenChange={setCommandOpen}
      title="Quick actions"
      description="Add an entry or jump to a section"
      // Opened by ⌘K many times a day: an entrance animation here reads as the
      // app being slow. The veil still fades, which costs nothing perceptually.
      className="anim-none"
    >
      <CommandInput placeholder="Add an entry or jump to a section…" />
      <CommandList>
        <CommandEmpty>Nothing matches that.</CommandEmpty>

        <CommandGroup heading="Add">
          <CommandItem onSelect={() => openTransaction('expense')}>
            <Minus className="text-muted-foreground" />
            Add expense
            <CommandShortcut>E</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => openTransaction('income')}>
            <Plus className="text-muted-foreground" />
            Add income
            <CommandShortcut>I</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={openTransfer}>
            <ArrowLeftRight className="text-muted-foreground" />
            Add transfer
            <CommandShortcut>T</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Go to">
          {DESTINATIONS.map((destination) => (
            <CommandItem key={destination.to} onSelect={() => go(destination.to)}>
              <destination.icon className="text-muted-foreground" />
              {destination.label}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Maintenance">
          <CommandItem
            onSelect={() => {
              setCommandOpen(false)
              void api.jobs
                .run()
                .then((report) => {
                  invalidate()
                  toast.success(
                    report.postedTransactions > 0
                      ? `Posted ${report.postedTransactions} recurring entr${
                          report.postedTransactions === 1 ? 'y' : 'ies'
                        }`
                      : 'Everything is already up to date',
                  )
                })
                .catch((error: Error) => toast.error(error.message))
            }}
          >
            <RefreshCw className="text-muted-foreground" />
            Run scheduled postings now
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
