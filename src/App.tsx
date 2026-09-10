import { lazy } from 'react'
import { Route, Routes } from 'react-router'
import { ChartPie, Flag, Plug, Sparkles } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { QuickActionsProvider } from '@/features/quick-actions/QuickActions'
import { Placeholder } from '@/pages/Placeholder'

/*
 * Split per route. The dashboard alone pulls in ECharts, and the tables pull in
 * TanStack Table; loading both up front makes the first paint wait on code the
 * screen in front of you does not use. `AppShell` holds the suspense boundary,
 * so the sidebar and ground are painted while a page arrives.
 */
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const Transactions = lazy(() => import('@/pages/Transactions'))
const Accounts = lazy(() => import('@/pages/Accounts'))
const Categories = lazy(() => import('@/pages/Categories'))
const Budgets = lazy(() => import('@/pages/Budgets'))
const Recurring = lazy(() => import('@/pages/Recurring'))
const Investments = lazy(() => import('@/pages/Investments'))

export default function App() {
  return (
    <QuickActionsProvider>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="transactions" element={<Transactions />} />
          <Route path="accounts" element={<Accounts />} />
          <Route path="categories" element={<Categories />} />
          <Route path="budgets" element={<Budgets />} />
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
          <Route path="recurring" element={<Recurring />} />
          <Route path="investments" element={<Investments />} />
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
