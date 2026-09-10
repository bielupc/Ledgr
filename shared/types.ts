import type { CategoryKind, Frequency, OrderKind } from './schemas.ts'

export interface Account {
  id: string
  name: string
  icon: string
  initialBalanceCents: number
  sortOrder: number
  createdAt: string
  deletedAt: string | null
}

export interface AccountBalance extends Omit<Account, 'createdAt'> {
  balanceCents: number
}

export interface Category {
  id: string
  name: string
  icon: string
  kind: CategoryKind
  color: string | null
  sortOrder: number
  createdAt: string
  deletedAt: string | null
}

export interface Transaction {
  id: string
  kind: CategoryKind
  occurredOn: string
  amountCents: number
  accountId: string
  categoryId: string | null
  name: string | null
  icon: string | null
  recurringRuleId: string | null
  createdAt: string
}

/** A transaction joined to the names/icons its row needs to render. */
export interface TransactionRow extends Transaction {
  accountName: string
  accountIcon: string
  categoryName: string | null
  categoryIcon: string | null
  categoryColor: string | null
}

export interface Transfer {
  id: string
  occurredOn: string
  amountCents: number
  fromAccountId: string
  toAccountId: string
  note: string | null
  createdAt: string
}

export interface TransferRow extends Transfer {
  fromAccountName: string
  fromAccountIcon: string
  toAccountName: string
  toAccountIcon: string
}

/** One page of a filtered list, with the row count for the *whole* filter —
 *  `rows.length` is only ever this page's. */
export interface Page<Row> {
  rows: Row[]
  total: number
}

export interface Budget {
  id: string
  categoryId: string
  amountCents: number
  createdAt: string
  updatedAt: string
}

export interface BudgetStatus {
  categoryId: string
  categoryName: string
  categoryIcon: string
  categoryColor: string | null
  budgetCents: number
  spentCents: number
}

export interface RecurringRule {
  id: string
  kind: CategoryKind
  amountCents: number
  accountId: string
  categoryId: string | null
  name: string | null
  frequency: Frequency
  intervalCount: number
  startDate: string
  endDate: string | null
  occurrenceIndex: number
  nextRunOn: string
  lastPostedOn: string | null
  isActive: number
  createdAt: string
  deletedAt: string | null
}

export interface RecurringRuleRow extends RecurringRule {
  accountName: string
  accountIcon: string
  categoryName: string | null
  categoryIcon: string | null
}

export interface NetWorthSnapshot {
  capturedOn: string
  amountCents: number
}

export interface MonthlyTotals {
  month: string
  incomeCents: number
  expenseCents: number
  balanceCents: number
}

export interface CategoryTotal {
  categoryId: string | null
  categoryName: string
  categoryIcon: string
  categoryColor: string | null
  totalCents: number
}

export interface DashboardSummary {
  netWorthCents: number
  monthIncomeCents: number
  monthExpenseCents: number
  monthBalanceCents: number
  previousNetWorthCents: number | null
}

/* ------------------------------------------------------- investments --- */

export interface Fund {
  isin: string
  name: string
  shortName: string | null
  ftXid: string | null
  resolvedAt: string | null
  targetBps: number
  sortOrder: number
  createdAt: string
}

export interface InvestmentOrder {
  id: string
  brokerOperationId: string
  isin: string
  kind: OrderKind
  tradedOn: string
  settledOn: string
  shareUnits: number
  navMicros: number
  amountCents: number
  createdAt: string
}

/** An order joined to the fund it belongs to, for the orders table. */
export interface InvestmentOrderRow extends InvestmentOrder {
  fundName: string
  fundShortName: string | null
}

export interface FundPrice {
  isin: string
  pricedOn: string
  navMicros: number
  source: 'ft' | 'order'
}

/** One held fund, valued as of today. Funds fully sold (zero shares) are
 *  never included — see `computeHoldings` in `server/portfolio.ts`. */
export interface Holding {
  isin: string
  name: string
  shortName: string | null
  shares: number
  costBasisCents: number
  navMicros: number | null
  navAsOf: string | null
  valueCents: number
  gainCents: number
  gainPercent: number | null
  targetBps: number
  weightBps: number
  driftBps: number
  /** Positive: buy this much more to reach target. Negative: over target. */
  toTargetCents: number
}

/** One day of the portfolio's value history. `twrIndex` is chain-linked from
 *  1 at the series' first day — a time-weighted return that only external
 *  buy/sell flows move, so a traspaso between funds never reads as a gain. */
export interface PortfolioPoint {
  date: string
  valueCents: number
  /** Cumulative net external contribution (buy − sell) as of this date. */
  contributedCents: number
  twrIndex: number
}

export interface PortfolioSummary {
  valueCents: number
  contributedCents: number
  gainCents: number
  gainPercent: number | null
  twrPercent: number
  dayChangeCents: number
  /** The most recent date any held fund has a price for. */
  navAsOf: string | null
  syncedAt: string | null
}

export interface MonthlyContribution {
  month: string
  boughtCents: number
  soldCents: number
  netCents: number
}

export interface FundPriceSeries {
  prices: FundPrice[]
  orders: InvestmentOrder[]
}

export interface ImportOrdersResult {
  inserted: number
  skipped: number
  newFunds: number
}
