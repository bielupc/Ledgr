import { motion } from 'motion/react'
import { PortfolioHero } from '@/features/investments/PortfolioHero'
import { AllocationPanel } from '@/features/investments/AllocationPanel'
import { TargetPanel } from '@/features/investments/TargetPanel'
import { PerformanceChart } from '@/features/investments/PerformanceChart'
import { ContributionsChart } from '@/features/investments/ContributionsChart'
import { FundChart } from '@/features/investments/FundChart'
import { OrdersTable } from '@/features/investments/OrdersTable'
import { ImportOrdersButton } from '@/features/investments/ImportOrdersButton'
import { PageHeader } from '@/components/layout/PageHeader'
import { stagger } from '@/lib/motion'

export default function Investments() {
  return (
    <motion.div variants={stagger()} initial="hidden" animate="visible" className="flex flex-col gap-4">
      <PageHeader title="Investments">
        <ImportOrdersButton variant="outline" />
      </PageHeader>

      <PortfolioHero />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <AllocationPanel />
        <TargetPanel />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <PerformanceChart />
        <ContributionsChart />
      </div>

      <FundChart />

      <OrdersTable />
    </motion.div>
  )
}
