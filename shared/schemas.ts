import { z } from 'zod'

export const CATEGORY_KINDS = ['expense', 'income'] as const
export const FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'] as const
/** buy/sell are external cash in and out. transferIn/transferOut are
 *  MyInvestor "traspasos" and fund switches — money moving between funds
 *  inside the same portfolio, never a contribution. */
export const ORDER_KINDS = ['buy', 'sell', 'transferIn', 'transferOut'] as const

export type CategoryKind = (typeof CATEGORY_KINDS)[number]
export type Frequency = (typeof FREQUENCIES)[number]
export type OrderKind = (typeof ORDER_KINDS)[number]

export const MAX_AMOUNT_CENTS = 100_000_000_000

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date as YYYY-MM-DD')

const amountCents = z
  .number()
  .int('Amounts are whole cents')
  .positive('Amount must be greater than zero')
  .max(MAX_AMOUNT_CENTS)

const name = z.string().trim().min(1, 'Required').max(60)
/** A transaction's own label. Optional, so quick entry stays one keystroke per
 *  field, and tables fall back to the category name when it is absent. */
const optionalName = z.string().trim().max(80).optional().nullable()
const note = z.string().trim().max(280).optional().nullable()
const icon = z.string().trim().min(1).max(40)
/** Null means: inherit the icon from the category. */
const optionalIcon = z.string().trim().min(1).max(40).optional().nullable()

export const accountInputSchema = z.object({
  name,
  icon: icon.default('wallet'),
  initialBalanceCents: z
    .number()
    .int()
    .min(-MAX_AMOUNT_CENTS)
    .max(MAX_AMOUNT_CENTS)
    .default(0),
  sortOrder: z.number().int().default(0),
})

export const categoryInputSchema = z.object({
  name,
  icon: icon.default('tag'),
  kind: z.enum(CATEGORY_KINDS),
  color: z.string().trim().max(24).optional().nullable(),
  sortOrder: z.number().int().default(0),
})

export const transactionInputSchema = z.object({
  kind: z.enum(CATEGORY_KINDS),
  occurredOn: isoDate,
  amountCents,
  accountId: z.string().min(1),
  categoryId: z.string().min(1).optional().nullable(),
  name: optionalName,
  icon: optionalIcon,
})

export const transferInputBaseSchema = z.object({
  occurredOn: isoDate,
  amountCents,
  fromAccountId: z.string().min(1),
  toAccountId: z.string().min(1),
  note,
})

export const transferInputSchema = transferInputBaseSchema.refine(
  (v) => v.fromAccountId !== v.toAccountId,
  { message: 'Pick two different accounts', path: ['toAccountId'] },
)

export const budgetInputSchema = z.object({
  categoryId: z.string().min(1),
  amountCents: z.number().int().min(0).max(MAX_AMOUNT_CENTS),
})

export const recurringRuleInputBaseSchema = z.object({
  kind: z.enum(CATEGORY_KINDS),
  amountCents,
  accountId: z.string().min(1),
  categoryId: z.string().min(1).optional().nullable(),
  name: optionalName,
  frequency: z.enum(FREQUENCIES),
  intervalCount: z.number().int().positive().max(365).default(1),
  startDate: isoDate,
  endDate: isoDate.optional().nullable(),
  isActive: z.boolean().default(true),
})

export const recurringRuleInputSchema = recurringRuleInputBaseSchema.refine(
  (v) => !v.endDate || v.endDate >= v.startDate,
  { message: 'End date cannot precede the start date', path: ['endDate'] },
)

export const monthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, 'Expected a month as YYYY-MM')

/*
 * Sort keys are enums, not free text: the column is interpolated into the
 * ORDER BY clause, which no bound parameter can stand in for.
 */
export const TRANSACTION_SORTS = [
  'occurredOn',
  'amountCents',
  'name',
  'categoryName',
  'accountName',
] as const
export const TRANSFER_SORTS = ['occurredOn', 'amountCents', 'note'] as const
export const SORT_DIRECTIONS = ['asc', 'desc'] as const

export type TransactionSort = (typeof TRANSACTION_SORTS)[number]
export type TransferSort = (typeof TRANSFER_SORTS)[number]
export type SortDirection = (typeof SORT_DIRECTIONS)[number]

const pageQuery = {
  limit: z.coerce.number().int().positive().max(1000).default(500),
  offset: z.coerce.number().int().min(0).default(0),
  dir: z.enum(SORT_DIRECTIONS).default('desc'),
}

export const transactionQuerySchema = z.object({
  month: monthSchema.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  kind: z.enum(CATEGORY_KINDS).optional(),
  accountId: z.string().optional(),
  categoryId: z.string().optional(),
  search: z.string().trim().max(120).optional(),
  sort: z.enum(TRANSACTION_SORTS).default('occurredOn'),
  ...pageQuery,
})

export const transferQuerySchema = z.object({
  month: monthSchema.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  accountId: z.string().optional(),
  search: z.string().trim().max(120).optional(),
  sort: z.enum(TRANSFER_SORTS).default('occurredOn'),
  ...pageQuery,
})

/* ------------------------------------------------------- investments --- */

/** One row of MyInvestor's order-history export, already mapped from its
 *  Spanish operation names to `OrderKind` — see `shared/brokerOrders.ts`. */
export const brokerOrderInputSchema = z.object({
  brokerOperationId: z.string().min(1).max(60),
  isin: z.string().regex(/^[A-Z0-9]{12}$/, 'Expected a 12-character ISIN'),
  fundName: z.string().trim().min(1).max(120),
  kind: z.enum(ORDER_KINDS),
  tradedOn: isoDate,
  settledOn: isoDate,
  // Shares × 1e8 and NAV × 1e6 — see the shareUnits/navMicros comment in
  // migrations/0005_investments.sql for why these are scaled integers.
  shareUnits: z.number().int().positive(),
  navMicros: z.number().int().positive(),
  amountCents: z.number().int().positive().max(MAX_AMOUNT_CENTS),
})

export const importOrdersInputSchema = z.object({
  orders: z.array(brokerOrderInputSchema).min(1).max(2000),
})

export const targetsInputSchema = z
  .object({
    targets: z
      .array(
        z.object({
          isin: z.string().min(1),
          targetBps: z.number().int().min(0).max(10000),
        }),
      )
      .max(50),
  })
  .refine((v) => v.targets.reduce((sum, t) => sum + t.targetBps, 0) <= 10000, {
    message: 'Targets cannot add up to more than 100%',
    path: ['targets'],
  })

export const fundPatchSchema = z.object({
  shortName: z.string().trim().max(40).optional().nullable(),
})

export type AccountInput = z.input<typeof accountInputSchema>
export type CategoryInput = z.input<typeof categoryInputSchema>
export type TransactionInput = z.infer<typeof transactionInputSchema>
export type TransferInput = z.infer<typeof transferInputSchema>
export type BudgetInput = z.infer<typeof budgetInputSchema>
export type RecurringRuleInput = z.input<typeof recurringRuleInputSchema>
export type TransactionQuery = z.infer<typeof transactionQuerySchema>
export type TransferQuery = z.infer<typeof transferQuerySchema>
export type BrokerOrderInput = z.infer<typeof brokerOrderInputSchema>
export type ImportOrdersInput = z.infer<typeof importOrdersInputSchema>
export type TargetsInput = z.infer<typeof targetsInputSchema>
export type FundPatchInput = z.infer<typeof fundPatchSchema>
