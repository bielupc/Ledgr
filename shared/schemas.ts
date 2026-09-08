import { z } from 'zod'

export const CATEGORY_KINDS = ['expense', 'income'] as const
export const FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'] as const

export type CategoryKind = (typeof CATEGORY_KINDS)[number]
export type Frequency = (typeof FREQUENCIES)[number]

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

export const transactionQuerySchema = z.object({
  month: monthSchema.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  kind: z.enum(CATEGORY_KINDS).optional(),
  accountId: z.string().optional(),
  categoryId: z.string().optional(),
  search: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().positive().max(1000).default(500),
})

export const transferQuerySchema = z.object({
  month: monthSchema.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  accountId: z.string().optional(),
  search: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().positive().max(1000).default(500),
})

export type AccountInput = z.input<typeof accountInputSchema>
export type CategoryInput = z.input<typeof categoryInputSchema>
export type TransactionInput = z.infer<typeof transactionInputSchema>
export type TransferInput = z.infer<typeof transferInputSchema>
export type BudgetInput = z.infer<typeof budgetInputSchema>
export type RecurringRuleInput = z.input<typeof recurringRuleInputSchema>
export type TransactionQuery = z.infer<typeof transactionQuerySchema>
export type TransferQuery = z.infer<typeof transferQuerySchema>
