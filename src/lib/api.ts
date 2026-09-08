import type {
  AccountBalance,
  BudgetStatus,
  Category,
  CategoryTotal,
  DashboardSummary,
  MonthlyTotals,
  NetWorthSnapshot,
  RecurringRuleRow,
  TransactionRow,
  TransferRow,
} from '@shared/types.ts'
import type {
  AccountInput,
  BudgetInput,
  CategoryInput,
  RecurringRuleInput,
  TransactionInput,
  TransferInput,
} from '@shared/schemas.ts'

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    ...init,
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null
    throw new ApiError(payload?.error ?? response.statusText, response.status)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

function search(params: Record<string, string | number | undefined | null>): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value))
    }
  }
  const serialised = query.toString()
  return serialised ? `?${serialised}` : ''
}

const send = <T>(method: string, path: string, payload?: unknown) =>
  request<T>(path, {
    method,
    body: payload === undefined ? undefined : JSON.stringify(payload),
  })

export const api = {
  accounts: {
    list: (includeDeleted = false) =>
      request<AccountBalance[]>(`/accounts${search({ includeDeleted: String(includeDeleted) })}`),
    create: (input: AccountInput) => send<AccountBalance>('POST', '/accounts', input),
    update: (id: string, input: Partial<AccountInput>) =>
      send<AccountBalance>('PATCH', `/accounts/${id}`, input),
    remove: (id: string) => send<{ ok: true }>('DELETE', `/accounts/${id}`),
    restore: (id: string) => send<{ ok: true }>('POST', `/accounts/${id}/restore`),
  },

  categories: {
    list: (params: { kind?: string; includeDeleted?: boolean } = {}) =>
      request<Category[]>(
        `/categories${search({
          kind: params.kind,
          includeDeleted: params.includeDeleted ? 'true' : undefined,
        })}`,
      ),
    create: (input: CategoryInput) => send<Category>('POST', '/categories', input),
    update: (id: string, input: Partial<Omit<CategoryInput, 'kind'>>) =>
      send<Category>('PATCH', `/categories/${id}`, input),
    remove: (id: string) => send<{ ok: true }>('DELETE', `/categories/${id}`),
    restore: (id: string) => send<{ ok: true }>('POST', `/categories/${id}/restore`),
  },

  transactions: {
    list: (params: {
      month?: string
      kind?: string
      accountId?: string
      categoryId?: string
      search?: string
      limit?: number
    }) => request<TransactionRow[]>(`/transactions${search(params)}`),
    create: (input: TransactionInput) => send<TransactionRow>('POST', '/transactions', input),
    update: (id: string, input: Partial<TransactionInput>) =>
      send<TransactionRow>('PATCH', `/transactions/${id}`, input),
    remove: (id: string) => send<{ ok: true }>('DELETE', `/transactions/${id}`),
  },

  transfers: {
    list: (params: { month?: string; accountId?: string; search?: string; limit?: number }) =>
      request<TransferRow[]>(`/transfers${search(params)}`),
    create: (input: TransferInput) => send<TransferRow>('POST', '/transfers', input),
    update: (id: string, input: Partial<TransferInput>) =>
      send<TransferRow>('PATCH', `/transfers/${id}`, input),
    remove: (id: string) => send<{ ok: true }>('DELETE', `/transfers/${id}`),
  },

  budgets: {
    list: (month: string) => request<BudgetStatus[]>(`/budgets${search({ month })}`),
    upsert: (input: BudgetInput) => send<{ ok: true }>('PUT', '/budgets', input),
    remove: (categoryId: string) => send<{ ok: true }>('DELETE', `/budgets/${categoryId}`),
  },

  recurring: {
    list: () => request<RecurringRuleRow[]>('/recurring'),
    create: (input: RecurringRuleInput) => send<RecurringRuleRow>('POST', '/recurring', input),
    update: (id: string, input: Partial<RecurringRuleInput>) =>
      send<RecurringRuleRow>('PATCH', `/recurring/${id}`, input),
    remove: (id: string) => send<{ ok: true }>('DELETE', `/recurring/${id}`),
  },

  analytics: {
    summary: (month: string) => request<DashboardSummary>(`/analytics/summary${search({ month })}`),
    netWorth: () => request<NetWorthSnapshot[]>('/analytics/net-worth'),
    monthly: (month: string, months = 12) =>
      request<MonthlyTotals[]>(`/analytics/monthly${search({ month, months })}`),
    byCategory: (month: string, kind: 'expense' | 'income') =>
      request<CategoryTotal[]>(`/analytics/by-category${search({ month, kind })}`),
    budgetStatus: (month: string) =>
      request<BudgetStatus[]>(`/analytics/budget-status${search({ month })}`),
  },

  jobs: {
    run: () => send<{ postedTransactions: number; snapshotsWritten: number }>('POST', '/jobs/run'),
  },
}
