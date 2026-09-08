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
import { ScrollArea } from '@/components/ui/scroll-area'
import { useCreateAccount } from '@/features/accounts/hooks'
import { ICON_NAMES, resolveIcon } from '@/lib/icons'
import { cn } from '@/lib/utils'

export function AccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('wallet')
  const [balance, setBalance] = useState('')
  const [error, setError] = useState<string | null>(null)

  const create = useCreateAccount()

  useEffect(() => {
    if (!open) return
    setName('')
    setIcon('wallet')
    setBalance('')
    setError(null)
  }, [open])

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return setError('Give the account a name')

    const normalised = balance.replace(/\s/g, '').replace(',', '.')
    const value = normalised === '' ? 0 : Number(normalised)
    if (!Number.isFinite(value)) return setError('That opening balance is not a number')

    create.mutate(
      { name: name.trim(), icon, initialBalanceCents: Math.round(value * 100), sortOrder: 0 },
      {
        onSuccess: () => {
          toast.success(`${name.trim()} added`)
          onClose()
        },
        onError: (mutationError) => setError(mutationError.message),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>New account</DialogTitle>
          <DialogDescription>
            Its balance counts toward net worth from the opening figure onward.
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
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-subtle-foreground">
                €
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Icon</Label>
            <ScrollArea className="h-[132px] rounded-lg border border-border">
              <div className="grid grid-cols-8 gap-1 p-2">
                {ICON_NAMES.map((option) => {
                  const Icon = resolveIcon(option)
                  const selected = option === icon
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setIcon(option)}
                      aria-label={option}
                      aria-pressed={selected}
                      className={cn(
                        'grid aspect-square place-items-center rounded-md border transition-colors',
                        selected
                          ? 'border-emerald bg-emerald/10 text-accent-ink'
                          : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
                      )}
                    >
                      <Icon className="size-4" strokeWidth={1.75} />
                    </button>
                  )
                })}
              </div>
            </ScrollArea>
          </div>

          {error && <p className="text-[13px] text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Adding…' : 'Add account'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
