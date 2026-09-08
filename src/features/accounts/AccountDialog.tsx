import { useEffect, useState } from 'react'
import { toast } from 'sonner'
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
import { IconPicker } from '@/components/IconPicker'
import { useCreateAccount, useUpdateAccount } from '@/features/accounts/hooks'
import type { AccountBalance } from '@shared/types.ts'

export function AccountDialog({
  open,
  account,
  onClose,
}: {
  open: boolean
  /** Present when renaming or re-opening an existing account. */
  account?: AccountBalance
  onClose: () => void
}) {
  /*
   * Callers drop their editing row in the same tick they ask for a close, but
   * the dialog is still animating out. Holding the last row keeps the title and
   * submit label showing the edit on the way out rather than flashing back to
   * "New account" for the length of the exit.
   */
  const [lastAccount, setLastAccount] = useState(account)
  const held = open ? account : lastAccount

  const [name, setName] = useState('')
  const [icon, setIcon] = useState('wallet')
  const [balance, setBalance] = useState('')
  const [error, setError] = useState<string | null>(null)

  const create = useCreateAccount()
  const update = useUpdateAccount()
  const pending = create.isPending || update.isPending

  useEffect(() => {
    if (open) setLastAccount(account)
  }, [open, account])

  useEffect(() => {
    if (!open) return
    setError(null)
    setName(held?.name ?? '')
    setIcon(held?.icon ?? 'wallet')
    setBalance(held ? String(held.initialBalanceCents / 100).replace('.', ',') : '')
  }, [open, held])

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return setError('Give the account a name')

    const normalised = balance.replace(/\s/g, '').replace(',', '.')
    const value = normalised === '' ? 0 : Number(normalised)
    if (!Number.isFinite(value)) return setError('That opening balance is not a number')

    const input = { name: name.trim(), icon, initialBalanceCents: Math.round(value * 100) }
    const settle = (message: string) => ({
      onSuccess: () => {
        toast.success(message)
        onClose()
      },
      onError: (mutationError: Error) => setError(mutationError.message),
    })

    if (held) {
      return update.mutate({ id: held.id, input }, settle(`${input.name} updated`))
    }
    create.mutate({ ...input, sortOrder: 0 }, settle(`${input.name} added`))
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <IconPicker
              value={icon}
              onChange={(next) => setIcon(next ?? 'wallet')}
              allowInherit={false}
            />
            <DialogTitle>{held ? 'Edit account' : 'New account'}</DialogTitle>
          </div>
          <DialogDescription className="sr-only">
            Name the account and state the balance it starts from.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="account-name">Name</Label>
            <Input
              id="account-name"
              autoFocus
              placeholder="Current account"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="account-balance">Opening balance</Label>
            <div className="relative">
              <Input
                id="account-balance"
                inputMode="decimal"
                placeholder="0,00"
                value={balance}
                onChange={(event) => setBalance(event.target.value)}
                className="tabular pr-9"
              />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-subtle-foreground">
                €
              </span>
            </div>
          </div>

          {error && <p className="text-[13px] text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : held ? 'Save changes' : 'Add account'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
