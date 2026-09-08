import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { motion } from 'motion/react'
import { ArrowDownLeft, ArrowLeftRight, ArrowRight, ArrowUpRight, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { IconPicker } from '@/components/IconPicker'
import { useAccounts } from '@/features/accounts/hooks'
import { useCategories } from '@/features/categories/hooks'
import { useCreateTransaction } from '@/features/transactions/hooks'
import { useCreateTransfer } from '@/features/transfers/hooks'
import { resolveIcon } from '@/lib/icons'
import { todayIso } from '@/lib/format'
import { cn } from '@/lib/utils'
import { DURATION, EASE } from '@/lib/motion'
import type { CategoryKind } from '@shared/schemas.ts'

export type EntryMode = CategoryKind | 'transfer'

const MODES = [
  { value: 'expense', label: 'Expense', icon: ArrowUpRight, tint: 'text-negative' },
  { value: 'income', label: 'Income', icon: ArrowDownLeft, tint: 'text-positive' },
  { value: 'transfer', label: 'Transfer', icon: ArrowLeftRight, tint: 'text-accent-ink' },
] as const

/*
 * One dialog for all three ways money moves. They share an amount and a date;
 * only the destination differs, which is a mode switch rather than a separate
 * modal to find.
 */
function AccountSelect({
  value,
  onValueChange,
  options,
  placeholder,
}: {
  value: string
  onValueChange: (value: string) => void
  options: { id: string; name: string; icon: string | null }[]
  placeholder: string
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="w-full min-w-0 *:data-[slot=select-value]:min-w-0">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((account) => {
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
  )
}

export function EntryDialog({
  open,
  initialMode,
  onClose,
}: {
  open: boolean
  initialMode: EntryMode
  onClose: () => void
}) {
  const [mode, setMode] = useState<EntryMode>(initialMode)
  const [amountCents, setAmountCents] = useState(0)
  const [occurredOn, setOccurredOn] = useState(todayIso)
  const [accountId, setAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [name, setName] = useState('')
  const [icon, setIcon] = useState<string | null>(null)
  const [toAccountId, setToAccountId] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const accounts = useAccounts()
  const isTransfer = mode === 'transfer'
  const categories = useCategories({ kind: isTransfer ? 'expense' : mode })
  const createTransaction = useCreateTransaction()
  const createTransfer = useCreateTransfer()
  const pending = createTransaction.isPending || createTransfer.isPending

  useEffect(() => {
    if (!open) return
    setMode(initialMode)
    setAmountCents(0)
    setOccurredOn(todayIso())
    setName('')
    setIcon(null)
    setNote('')
    setError(null)
  }, [open, initialMode])

  // Categories are kind-specific, so a mode switch must drop a now-invalid pick.
  useEffect(() => setCategoryId(''), [mode])

  useEffect(() => {
    if (!accountId && accounts.data?.length) setAccountId(accounts.data[0]!.id)
  }, [accounts.data, accountId])

  const options = accounts.data ?? []
  const category = categories.data?.find((row) => row.id === categoryId)

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (amountCents <= 0) return setError('Enter an amount greater than zero')
    if (!accountId) return setError(isTransfer ? 'Pick an account to move from' : 'Pick an account')

    const settle = (message: string) => ({
      onSuccess: () => {
        toast.success(message)
        onClose()
      },
      onError: (mutationError: Error) => setError(mutationError.message),
    })

    if (isTransfer) {
      if (!toAccountId) return setError('Pick an account to move to')
      if (toAccountId === accountId) return setError('Pick two different accounts')
      return createTransfer.mutate(
        {
          amountCents,
          occurredOn,
          fromAccountId: accountId,
          toAccountId,
          note: note.trim() || null,
        },
        settle('Transfer recorded'),
      )
    }

    createTransaction.mutate(
      {
        kind: mode,
        amountCents,
        occurredOn,
        accountId,
        categoryId: categoryId || null,
        name: name.trim() || null,
        icon,
      },
      settle(mode === 'expense' ? 'Expense added' : 'Income added'),
    )
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
          {/* The icon identifies the entry, so it belongs with its title. Off
              the field grid, Name gets its whole column and all four fields
              land on one size. */}
          <div className="flex items-center gap-2.5">
            {!isTransfer && (
              <IconPicker
                value={icon}
                onChange={setIcon}
                fallback={category?.icon ?? (mode === 'expense' ? 'receipt' : 'banknote')}
              />
            )}
            <DialogTitle>New {mode}</DialogTitle>
          </div>
          {/* Kept for the accessible description, not shown: a caption here only
              restates the title. */}
          <DialogDescription className="sr-only">
            Enter an amount, then choose where it goes.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-surface/60 p-1">
            {MODES.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setMode(option.value)}
                className={cn(
                  'relative flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[12.5px] font-medium transition-colors duration-150',
                  mode === option.value
                    ? 'text-foreground'
                    : 'text-muted-foreground hoverfine:text-foreground',
                )}
              >
                {mode === option.value && (
                  <motion.span
                    layoutId="entry-mode"
                    transition={{ duration: DURATION.fast, ease: EASE.out }}
                    className="absolute inset-0 rounded-md border border-border bg-card"
                  />
                )}
                <option.icon
                  className={cn('relative size-3.5', mode === option.value && option.tint)}
                  strokeWidth={2.25}
                />
                <span className="relative">{option.label}</span>
              </button>
            ))}
          </div>

          <AmountPad
            cents={amountCents}
            onChange={setAmountCents}
            tone={mode === 'income' ? 'positive' : 'inherit'}
          />

          {isTransfer ? (
            <>
              {/* From and To belong on one line: the row itself is the
                  statement, and the arrow reads as the verb. */}
              <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label>From</Label>
                  <AccountSelect
                    value={accountId}
                    onValueChange={setAccountId}
                    options={options}
                    placeholder="Account"
                  />
                </div>

                <span className="grid h-9 w-5 place-items-center">
                  <ArrowRight className="size-3.5 text-accent-ink" strokeWidth={2.5} />
                </span>

                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label>To</Label>
                  <AccountSelect
                    value={toAccountId}
                    onValueChange={setToAccountId}
                    options={options.filter((account) => account.id !== accountId)}
                    placeholder="Account"
                  />
                </div>
              </div>

              {/* Same three-column track as the row above, spacer included, so
                  the four fields line up on two edges rather than three. */}
              <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="entry-date">Date</Label>
                  <DatePicker id="entry-date" value={occurredOn} onChange={setOccurredOn} />
                </div>

                <span className="w-5" />

                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="entry-note">Note</Label>
                  <Input
                    id="entry-note"
                    placeholder="Optional"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="entry-name">Name</Label>
                  <Input
                    id="entry-name"
                    placeholder={mode === 'expense' ? 'Mercadona' : 'Salary'}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </div>

                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="entry-date">Date</Label>
                  <DatePicker id="entry-date" value={occurredOn} onChange={setOccurredOn} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label>Category</Label>
                  <Select value={categoryId} onValueChange={setCategoryId}>
                    <SelectTrigger className="w-full min-w-0 *:data-[slot=select-value]:min-w-0">
                      <SelectValue placeholder="Uncategorised" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.data?.map((row) => {
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

                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label>Account</Label>
                  <AccountSelect
                    value={accountId}
                    onValueChange={setAccountId}
                    options={options}
                    placeholder="Account"
                  />
                </div>
              </div>
            </>
          )}

          {error && <p className="text-[13px] text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="gap-1.5" disabled={pending}>
              {isTransfer ? (
                <ArrowLeftRight className="size-4" strokeWidth={2.25} />
              ) : (
                <Check className="size-4" strokeWidth={2.25} />
              )}
              {pending ? 'Saving…' : isTransfer ? 'Record transfer' : `Add ${mode}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
