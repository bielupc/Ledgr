import { Route, Routes } from 'react-router'
import {
  ArrowLeftRight,
  ChartPie,
  Flag,
  Plug,
  Repeat,
  Sparkles,
  Tags,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { QuickActionsProvider } from '@/features/quick-actions/QuickActions'
import Dashboard from '@/pages/Dashboard'
import { Placeholder } from '@/pages/Placeholder'

export default function App() {
  return (
    <QuickActionsProvider>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route
            path="transactions"
            element={
              <Placeholder
                icon={ArrowLeftRight}
                title="Transaction tables are next"
                description="Filterable tables for the month's expenses, income and transfers. Use ⌘K to add entries in the meantime."
              />
            }
          />
          <Route
            path="accounts"
            element={
              <Placeholder
                icon={Wallet}
                title="Account management is next"
                description="Rename, re-icon and archive accounts here. Balances already appear on the dashboard."
              />
            }
          />
          <Route
            path="categories"
            element={
              <Placeholder
                icon={Tags}
                title="Category management is next"
                description="Separate expense and income lists, each editable and archivable without disturbing history."
              />
            }
          />
          <Route
            path="budgets"
            element={
              <Placeholder
                icon={Target}
                title="Budget editing is next"
                description="Set a monthly limit per expense category. Current-month progress already shows on the dashboard."
              />
            }
          />
          <Route
            path="goals"
            element={
              <Placeholder
                icon={Flag}
                title="Goals land here"
                description="Name what you are saving toward and track progress against it, month by month."
              />
            }
          />
          <Route
            path="recurring"
            element={
              <Placeholder
                icon={Repeat}
                title="Recurring series are next"
                description="Salary, rent and subscriptions post themselves on schedule. The engine already runs — this is the screen to manage it."
              />
            }
          />
          <Route
            path="investments"
            element={
              <Placeholder
                icon={TrendingUp}
                title="Investments land here"
                description="Holdings and their value over time, kept separate from the day-to-day ledger."
              />
            }
          />
          <Route
            path="agent"
            element={
              <Placeholder
                icon={Sparkles}
                title="The agent lands here"
                description="Ask where the money went and get an answer that reads the ledger rather than guessing at it."
              />
            }
          />
          <Route
            path="integrations"
            element={
              <Placeholder
                icon={Plug}
                title="Integrations land here"
                description="An MCP server exposing accounts, categories and transactions, so other tools can read the ledger and post to it."
              />
            }
          />
          <Route
            path="reports"
            element={
              <Placeholder
                icon={ChartPie}
                title="Deeper reports are next"
                description="Longer ranges and category drill-downs beyond the dashboard's month view."
              />
            }
          />
        </Route>
      </Routes>
    </QuickActionsProvider>
  )
}
