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
import { AmountPad } from '@/components/brand/AmountPad'
import { DynamicIcon } from '@/components/brand/DynamicIcon'
import { useClearBudget, useSetBudget } from '@/features/budgets/hooks'

export interface BudgetTarget {
  categoryId: string
  name: string
  icon: string
  /** 0 when the category has no limit yet. */
  budgetCents: number
}

/*
 * A limit is entered the same way every other amount in the app is — the pad,
 * committed by a button — rather than through a field that saves on blur. The
 * old inline row left no moment where the figure was obviously not yet saved,
 * and no way to abandon a half-typed number.
 */
export function BudgetDialog({
  open,
  target,
  onClose,
}: {
  open: boolean
  target?: BudgetTarget
  onClose: () => void
}) {
  /* Callers clear their target in the same tick they ask for a close, but the
     dialog is still animating out; holding the last one keeps the name and
     figure steady through the exit. */
  const [lastTarget, setLastTarget] = useState(target)
  const held = open ? target : lastTarget

  const [amountCents, setAmountCents] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const setBudget = useSetBudget()
  const clearBudget = useClearBudget()
  const pending = setBudget.isPending || clearBudget.isPending

  useEffect(() => {
    if (open) setLastTarget(target)
  }, [open, target])

  useEffect(() => {
    if (!open) return
    setError(null)
    setAmountCents(held?.budgetCents ?? 0)
  }, [open, held])

  const existing = (held?.budgetCents ?? 0) > 0

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!held) return
    if (amountCents <= 0) return setError('Enter a limit greater than zero')

    setBudget.mutate(
      { categoryId: held.categoryId, amountCents },
      {
        onSuccess: () => {
          toast.success(`${held.name} limit ${existing ? 'updated' : 'set'}`)
          onClose()
        },
        onError: (mutationError: Error) => setError(mutationError.message),
      },
    )
  }

  const remove = () => {
    if (!held) return
    clearBudget.mutate(held.categoryId, {
      onSuccess: () => {
        toast.success(`Limit removed from ${held.name}`)
        onClose()
      },
      onError: (mutationError: Error) => setError(mutationError.message),
    })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-surface">
              <DynamicIcon name={held?.icon} className="size-4 text-muted-foreground" />
            </span>
            <div className="flex flex-col">
              <DialogTitle>{held?.name}</DialogTitle>
              <span className="label-mono text-muted-foreground">Monthly limit</span>
            </div>
          </div>
          <DialogDescription className="sr-only">
            Set how much can be spent in this category each month. Limits reset monthly and do
            not roll over.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <AmountPad cents={amountCents} onChange={setAmountCents} />

          {error && <p className="text-[13px] text-destructive">{error}</p>}

          <DialogFooter className="sm:justify-between">
            {existing ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hoverfine:text-destructive"
                disabled={pending}
                onClick={remove}
              >
                Remove limit
              </Button>
            ) : (
              <span />
            )}

            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? 'Saving…' : existing ? 'Save limit' : 'Set limit'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
