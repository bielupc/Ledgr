import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { motion } from 'motion/react'
import { ArrowDownLeft, ArrowUpRight, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AmountPad } from '@/components/brand/AmountPad'
import { DatePicker } from '@/components/brand/DatePicker'
import { useAccounts } from '@/features/accounts/hooks'
import { useCategories } from '@/features/categories/hooks'
import { useCreateRecurring, useUpdateRecurring } from '@/features/recurring/hooks'
import { FREQUENCIES, type CategoryKind, type Frequency } from '@shared/schemas.ts'
import { resolveIcon } from '@/lib/icons'
import { todayIso } from '@/lib/format'
import { cn } from '@/lib/utils'
import { DURATION, EASE } from '@/lib/motion'
import type { RecurringRuleRow } from '@shared/types.ts'

const KINDS = [
  { value: 'expense', label: 'Expense', icon: ArrowUpRight, tint: 'text-negative' },
  { value: 'income', label: 'Income', icon: ArrowDownLeft, tint: 'text-positive' },
] as const

const FREQUENCY_LABELS: Record<Frequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
}

export function RecurringDialog({
  open,
  rule,
  onClose,
}: {
  open: boolean
  rule?: RecurringRuleRow
  onClose: () => void
}) {
  /*
   * Callers drop their editing row in the same tick they ask for a close, but
   * the dialog is still animating out. Holding the last row keeps the form
   * showing the series it was editing on the way out rather than flashing back
   * to a blank "new series" for the length of the exit.
   */
  const [lastRule, setLastRule] = useState(rule)
  const held = open ? rule : lastRule

  const editing = Boolean(held)
  const [kind, setKind] = useState<CategoryKind>('expense')
  const [amountCents, setAmountCents] = useState(0)
  const [accountId, setAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [name, setName] = useState('')
  const [frequency, setFrequency] = useState<Frequency>('monthly')
  const [intervalCount, setIntervalCount] = useState('1')
  const [startDate, setStartDate] = useState(todayIso)
  const [endDate, setEndDate] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const accounts = useAccounts(editing)
  const categories = useCategories({ kind, includeDeleted: editing })
  const create = useCreateRecurring()
  const update = useUpdateRecurring()
  const pending = create.isPending || update.isPending

  useEffect(() => {
    if (open) setLastRule(rule)
  }, [open, rule])

  useEffect(() => {
    if (!open) return
    setError(null)
    if (held) {
      setKind(held.kind)
      setAmountCents(held.amountCents)
      setAccountId(held.accountId)
      setCategoryId(held.categoryId ?? '')
      setName(held.name ?? '')
      setFrequency(held.frequency)
      setIntervalCount(String(held.intervalCount))
      setStartDate(held.startDate)
      setEndDate(held.endDate)
      return
    }
    setKind('expense')
    setAmountCents(0)
    setCategoryId('')
    setName('')
    setFrequency('monthly')
    setIntervalCount('1')
    setStartDate(todayIso())
    setEndDate(null)
  }, [open, held])

  useEffect(() => {
    if (!accountId && accounts.data?.length) setAccountId(accounts.data[0]!.id)
  }, [accounts.data, accountId])

  const accountOptions = (accounts.data ?? []).filter(
    (account) => !account.deletedAt || account.id === accountId,
  )
  const categoryOptions = (categories.data ?? []).filter(
    (row) => !row.deletedAt || row.id === categoryId,
  )

  const interval = Math.max(1, Math.min(365, Number(intervalCount) || 1))

  const switchKind = (next: CategoryKind) => {
    setKind(next)
    setCategoryId('')
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (amountCents <= 0) return setError('Enter an amount greater than zero')
    if (!accountId) return setError('Pick the account it posts to')
    if (endDate && endDate < startDate) return setError('End date cannot precede the start date')

    const input = {
      kind,
      amountCents,
      accountId,
      categoryId: categoryId || null,
      name: name.trim() || null,
      frequency,
      intervalCount: interval,
      startDate,
      endDate,
    }

    const settle = (message: string) => ({
      onSuccess: () => {
        toast.success(message)
        onClose()
      },
      onError: (mutationError: Error) => setError(mutationError.message),
    })

    if (held) {
      return update.mutate({ id: held.id, input }, settle('Series updated'))
    }
    create.mutate({ ...input, isActive: true }, settle('Series created'))
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className="max-h-[92vh] overflow-y-auto sm:max-w-[428px]"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          ;(event.currentTarget as HTMLElement).focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit series' : 'New recurring series'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          {/* Kind is fixed once a series exists: its category and its posted
              history are both filed under it. */}
          {!editing && (
            <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-surface/60 p-1">
              {KINDS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => switchKind(option.value)}
                  className={cn(
                    'relative flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[12.5px] font-medium transition-colors duration-150',
                    kind === option.value
                      ? 'text-foreground'
                      : 'text-muted-foreground hoverfine:text-foreground',
                  )}
                >
                  {kind === option.value && (
                    <motion.span
                      layoutId="recurring-kind"
                      transition={{ duration: DURATION.fast, ease: EASE.out }}
                      className="absolute inset-0 rounded-md border border-border bg-card"
                    />
                  )}
                  <option.icon
                    className={cn('relative size-3.5', kind === option.value && option.tint)}
                    strokeWidth={2.25}
                  />
                  <span className="relative">{option.label}</span>
                </button>
              ))}
            </div>
          )}

          <AmountPad
            cents={amountCents}
            onChange={setAmountCents}
            tone={kind === 'income' ? 'positive' : 'inherit'}
          />

          <div className="grid grid-cols-2 gap-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="rule-name">Name</Label>
              <Input
                id="rule-name"
                placeholder={kind === 'expense' ? 'Rent' : 'Salary'}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>

            <div className="flex min-w-0 flex-col gap-1.5">
              <Label>Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="w-full min-w-0 *:data-[slot=select-value]:min-w-0">
                  <SelectValue placeholder="Uncategorised" />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((row) => {
                    const Icon = resolveIcon(row.icon)
                    return (
                      <SelectItem key={row.id} value={row.id}>
                        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 truncate">{row.name}</span>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label>Account</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger className="w-full min-w-0 *:data-[slot=select-value]:min-w-0">
                  <SelectValue placeholder="Account" />
                </SelectTrigger>
                <SelectContent>
                  {accountOptions.map((account) => {
                    const Icon = resolveIcon(account.icon)
                    return (
                      <SelectItem key={account.id} value={account.id}>
                        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 truncate">{account.name}</span>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="flex min-w-0 flex-col gap-1.5">
              <Label>Repeats</Label>
              <Select value={frequency} onValueChange={(next) => setFrequency(next as Frequency)}>
                <SelectTrigger className="w-full min-w-0 *:data-[slot=select-value]:min-w-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCIES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {FREQUENCY_LABELS[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-[1fr_1fr_1fr] gap-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="rule-interval">Every</Label>
              <Input
                id="rule-interval"
                inputMode="numeric"
                value={intervalCount}
                onChange={(event) => setIntervalCount(event.target.value.replace(/\D/g, ''))}
                onBlur={() => setIntervalCount(String(interval))}
                className="tabular"
              />
            </div>

            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="rule-start">Starts</Label>
              <DatePicker id="rule-start" value={startDate} onChange={setStartDate} />
            </div>

            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="rule-end">Ends</Label>
              <DatePicker
                id="rule-end"
                value={endDate}
                placeholder="Never"
                onChange={setEndDate}
                onClear={() => setEndDate(null)}
              />
            </div>
          </div>

          {error && <p className="text-[13px] text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="gap-1.5" disabled={pending}>
              <Check className="size-4" strokeWidth={2.25} />
              {pending ? 'Saving…' : editing ? 'Save changes' : 'Create series'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
