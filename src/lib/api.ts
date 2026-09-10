import type {
  AccountBalance,
  BudgetStatus,
  Category,
  CategoryTotal,
  DashboardSummary,
  Fund,
  FundPriceSeries,
  Holding,
  ImportOrdersResult,
  InvestmentOrderRow,
  MonthlyContribution,
  MonthlyTotals,
  NetWorthSnapshot,
  Page,
  PortfolioPoint,
  PortfolioSummary,
  RecurringRuleRow,
  TransactionRow,
  TransferRow,
} from '@shared/types.ts'
import type {
  AccountInput,
  BrokerOrderInput,
  BudgetInput,
  CategoryInput,
  FundPatchInput,
  RecurringRuleInput,
  TargetsInput,
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

/*
 * In dev this is unset, so the fetch stays relative and Vite's own proxy
 * (vite.config.ts) reaches the Worker on localhost. In a Pages build,
 * VITE_API_URL (.env.production) points at the deployed Worker directly —
 * Pages and Workers are different origins, so this crosses it with CORS
 * (server/index.ts) rather than the same-origin request dev gets for free.
 */
const API_BASE = import.meta.env.VITE_API_URL ?? ''

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}/api${path}`, {
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
      from?: string
      to?: string
      kind?: string
      accountId?: string
      categoryId?: string
      search?: string
      limit?: number
      offset?: number
      sort?: string
      dir?: string
    }) => request<Page<TransactionRow>>(`/transactions${search(params)}`),
    create: (input: TransactionInput) => send<TransactionRow>('POST', '/transactions', input),
    update: (id: string, input: Partial<TransactionInput>) =>
      send<TransactionRow>('PATCH', `/transactions/${id}`, input),
    remove: (id: string) => send<{ ok: true }>('DELETE', `/transactions/${id}`),
  },

  transfers: {
    list: (params: {
      month?: string
      from?: string
      to?: string
      accountId?: string
      search?: string
      limit?: number
      offset?: number
      sort?: string
      dir?: string
    }) => request<Page<TransferRow>>(`/transfers${search(params)}`),
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

  investments: {
    summary: () => request<PortfolioSummary>('/investments/summary'),
    holdings: () => request<Holding[]>('/investments/holdings'),
    series: () => request<PortfolioPoint[]>('/investments/series'),
    contributions: () => request<MonthlyContribution[]>('/investments/contributions'),
    funds: () => request<Fund[]>('/investments/funds'),
    fundPrices: (isin: string) => request<FundPriceSeries>(`/investments/funds/${isin}/prices`),
    orders: () => request<InvestmentOrderRow[]>('/investments/orders'),
    importOrders: (orders: BrokerOrderInput[]) =>
      send<ImportOrdersResult>('POST', '/investments/orders/import', { orders }),
    setTargets: (input: TargetsInput) => send<{ ok: true }>('PUT', '/investments/targets', input),
    updateFund: (isin: string, input: FundPatchInput) =>
      send<Fund>('PATCH', `/investments/funds/${isin}`, input),
    refreshPrices: () => send<{ updated: number }>('POST', '/investments/prices/refresh'),
  },

  jobs: {
    run: () =>
      send<{ postedTransactions: number; pricesUpdated: number; snapshotsWritten: number }>(
        'POST',
        '/jobs/run',
      ),
  },
}
