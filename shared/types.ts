import type { CategoryKind, Frequency } from './schemas.ts'

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
