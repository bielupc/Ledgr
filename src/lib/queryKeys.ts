export const queryKeys = {
  accounts: (includeDeleted = false) => ['accounts', { includeDeleted }] as const,
  categories: (params: { kind?: string; includeDeleted?: boolean } = {}) =>
    ['categories', params] as const,
  transactions: (params: Record<string, unknown>) => ['transactions', params] as const,
  transfers: (params: Record<string, unknown>) => ['transfers', params] as const,
  budgets: (month: string) => ['budgets', month] as const,
  recurring: () => ['recurring'] as const,
  summary: (month: string) => ['analytics', 'summary', month] as const,
  netWorth: () => ['analytics', 'net-worth'] as const,
  monthly: (month: string, months: number) => ['analytics', 'monthly', month, months] as const,
  byCategory: (month: string, kind: string) =>
    ['analytics', 'by-category', month, kind] as const,
  budgetStatus: (month: string) => ['analytics', 'budget-status', month] as const,
}

/** Everything a write can invalidate. Mutations touch balances and analytics
 *  as often as they touch the list they came from. */
export const ledgerScopes = [
  ['accounts'],
  ['transactions'],
  ['transfers'],
  ['budgets'],
  ['analytics'],
] as const
