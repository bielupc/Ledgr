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
import { useCreateTransaction, useUpdateTransaction } from '@/features/transactions/hooks'
import { useCreateTransfer, useUpdateTransfer } from '@/features/transfers/hooks'
import { resolveIcon } from '@/lib/icons'
import { todayIso } from '@/lib/format'
import { cn } from '@/lib/utils'
import { DURATION, EASE } from '@/lib/motion'
import type { CategoryKind } from '@shared/schemas.ts'
import type { TransactionRow, TransferRow } from '@shared/types.ts'

export type EntryMode = CategoryKind | 'transfer'

/** What the dialog is editing, if anything. */
export type EntryRecord =
  | { type: 'transaction'; row: TransactionRow }
  | { type: 'transfer'; row: TransferRow }

const MODES = [
  { value: 'expense', label: 'Expense', icon: ArrowUpRight, tint: 'text-negative' },
  { value: 'income', label: 'Income', icon: ArrowDownLeft, tint: 'text-positive' },
  { value: 'transfer', label: 'Transfer', icon: ArrowLeftRight, tint: 'text-transfer' },
] as const

/*
 * One dialog for all three ways money moves, whether the record is new or being
 * corrected. They share an amount and a date; only the destination differs,
 * which is a mode switch rather than a separate modal to find.
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
  record,
  onClose,
}: {
  open: boolean
  initialMode: EntryMode
  /** Present when correcting an existing entry rather than adding one. */
  record?: EntryRecord
  onClose: () => void
}) {
  /*
   * Callers drop their editing row in the same tick they ask for a close, but
   * the dialog is still animating out. Holding the last row keeps the form
   * showing what it was editing on the way out — otherwise it flashes back to
   * a blank "new entry", mode switcher and all, for the length of the exit.
   */
  const [lastRecord, setLastRecord] = useState(record)
  const held = open ? record : lastRecord

  const editing = Boolean(held)
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

  const isTransfer = mode === 'transfer'
  // A historical row can point at an archived account or category. Editing it
  // has to keep that pick on screen rather than silently dropping it, so the
  // archived rows are fetched and then filtered back out below.
  const accounts = useAccounts(editing)
  const categories = useCategories({
    kind: isTransfer ? 'expense' : mode,
    includeDeleted: editing,
  })

  const createTransaction = useCreateTransaction()
  const updateTransaction = useUpdateTransaction()
  const createTransfer = useCreateTransfer()
  const updateTransfer = useUpdateTransfer()
  const pending =
    createTransaction.isPending ||
    updateTransaction.isPending ||
    createTransfer.isPending ||
    updateTransfer.isPending

  useEffect(() => {
    if (open) setLastRecord(record)
  }, [open, record])

  useEffect(() => {
    if (!open) return
    setError(null)

    if (held?.type === 'transfer') {
      const row = held.row
      setMode('transfer')
      setAmountCents(row.amountCents)
      setOccurredOn(row.occurredOn)
      setAccountId(row.fromAccountId)
      setToAccountId(row.toAccountId)
      setNote(row.note ?? '')
      setName('')
      setIcon(null)
      setCategoryId('')
      return
    }

    if (held?.type === 'transaction') {
      const row = held.row
      setMode(row.kind)
      setAmountCents(row.amountCents)
      setOccurredOn(row.occurredOn)
      setAccountId(row.accountId)
      setCategoryId(row.categoryId ?? '')
      setName(row.name ?? '')
      setIcon(row.icon)
      setNote('')
      return
    }

    setMode(initialMode)
    setAmountCents(0)
    setOccurredOn(todayIso())
    setCategoryId('')
    setName('')
    setIcon(null)
    setNote('')
  }, [open, initialMode, held])

  useEffect(() => {
    if (!accountId && accounts.data?.length) setAccountId(accounts.data[0]!.id)
  }, [accounts.data, accountId])

  const options = (accounts.data ?? []).filter(
    (account) => !account.deletedAt || account.id === accountId || account.id === toAccountId,
  )
  const categoryOptions = (categories.data ?? []).filter(
    (row) => !row.deletedAt || row.id === categoryId,
  )
  const category = categoryOptions.find((row) => row.id === categoryId)

  /*
   * Switching mode invalidates the category, which is kind-specific. Cleared
   * here rather than in an effect on `mode`, because an effect also fires when
   * the dialog sets the mode itself while loading a record to edit, and would
   * wipe the category it had just filled in.
   */
  const switchMode = (next: EntryMode) => {
    setMode(next)
    setCategoryId('')
  }

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

      const input = {
        amountCents,
        occurredOn,
        fromAccountId: accountId,
        toAccountId,
        note: note.trim() || null,
      }

      return held?.type === 'transfer'
        ? updateTransfer.mutate({ id: held.row.id, input }, settle('Transfer updated'))
        : createTransfer.mutate(input, settle('Transfer recorded'))
    }

    const input = {
      kind: mode,
      amountCents,
      occurredOn,
      accountId,
      categoryId: categoryId || null,
      name: name.trim() || null,
      icon,
    }

    if (held?.type === 'transaction') {
      return updateTransaction.mutate({ id: held.row.id, input }, settle('Entry updated'))
    }
    createTransaction.mutate(input, settle(mode === 'expense' ? 'Expense added' : 'Income added'))
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
            <DialogTitle>
              {editing ? 'Edit' : 'New'} {mode}
            </DialogTitle>
          </div>
          {/* Kept for the accessible description, not shown: a caption here only
              restates the title. */}
          <DialogDescription className="sr-only">
            Enter an amount, then choose where it goes.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          {/* No mode row when editing: transfers and transactions live in
              separate tables by design, so an edit cannot move a record between
              them, and changing a transaction's kind would strand its category.
              Both are delete-and-re-add. */}
          {!editing && (
            <div className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-surface/60 p-1">
              {MODES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => switchMode(option.value)}
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
          )}

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
                  <ArrowRight className="size-3.5 text-transfer" strokeWidth={2.5} />
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
              {isTransfer && !editing ? (
                <ArrowLeftRight className="size-4" strokeWidth={2.25} />
              ) : (
                <Check className="size-4" strokeWidth={2.25} />
              )}
              {pending
                ? 'Saving…'
                : editing
                  ? 'Save changes'
                  : isTransfer
                    ? 'Record transfer'
                    : `Add ${mode}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
