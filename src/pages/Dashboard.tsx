import { motion } from 'motion/react'
import { NetWorthHero } from '@/features/analytics/components/NetWorthHero'
import { BalanceChart, FlowChart } from '@/features/analytics/components/FlowCharts'
import { CategoryDonut } from '@/features/analytics/components/CategoryDonut'
import { AccountsPanel } from '@/features/analytics/components/AccountsPanel'
import { BudgetPanel } from '@/features/analytics/components/BudgetPanel'
import { MonthPicker } from '@/components/MonthPicker'
import { useMonthParam } from '@/hooks/useMonthParam'
import { stagger } from '@/lib/motion'

export default function Dashboard() {
  const [month, setMonth] = useMonthParam()

  return (
    <motion.div
      variants={stagger()}
      initial="hidden"
      animate="visible"
      className="flex flex-col gap-4"
    >
      <div className="flex justify-end">
        <MonthPicker month={month} onChange={setMonth} />
      </div>

      <NetWorthHero month={month} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <FlowChart month={month} kind="income" />
        <FlowChart month={month} kind="expense" />
        <BalanceChart month={month} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <CategoryDonut month={month} kind="expense" />
        <CategoryDonut month={month} kind="income" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AccountsPanel />
        <BudgetPanel month={month} />
      </div>
    </motion.div>
  )
}
