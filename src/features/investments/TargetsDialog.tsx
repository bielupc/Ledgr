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
import { useSetTargets } from '@/features/investments/hooks'
import { fundLabel, percentToBps } from '@/features/investments/format'
import { cn } from '@/lib/utils'
import type { Holding } from '@shared/types.ts'

/*
 * One percentage input per held fund, entered the same way — whole percent
 * points — rather than trying to make basis points a user-facing unit. The
 * unassigned remainder is shown so a mix that doesn't add to 100% is visible
 * before saving, not just rejected after.
 */
export function TargetsDialog({
  open,
  holdings,
  onClose,
}: {
  open: boolean
  holdings: Holding[]
  onClose: () => void
}) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const setTargets = useSetTargets()

  useEffect(() => {
    if (!open) return
    setError(null)
    setValues(
      Object.fromEntries(holdings.map((h) => [h.isin, h.targetBps > 0 ? String(h.targetBps / 100) : ''])),
    )
  }, [open, holdings])

  const totalPercent = holdings.reduce((sum, h) => sum + (Number(values[h.isin]) || 0), 0)
  const remaining = 100 - totalPercent

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (totalPercent > 100.01) return setError('Targets cannot add up to more than 100%')

    setTargets.mutate(
      {
        targets: holdings.map((h) => ({
          isin: h.isin,
          targetBps: percentToBps(Number(values[h.isin]) || 0),
        })),
      },
      {
        onSuccess: () => {
          toast.success('Targets updated')
          onClose()
        },
        onError: (mutationError: Error) => setError(mutationError.message),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Target allocation</DialogTitle>
          <DialogDescription className="sr-only">
            The share of the portfolio each holding should reach. Leave one at 0% to track it
            without a target.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-3">
          {holdings.map((h) => (
            <div key={h.isin} className="flex items-center gap-3">
              {/* Label itself is a flex container (shadcn's base class), so
                  `truncate` on it directly doesn't clip — the anonymous flex
                  item wrapping its text keeps the text's full intrinsic
                  width instead of shrinking to the row. An inner block span
                  truncates correctly. */}
              <Label htmlFor={`target-${h.isin}`} className="min-w-0 flex-1 font-normal">
                <span className="block truncate">{fundLabel(h)}</span>
              </Label>
              <div className="relative w-[84px] shrink-0">
                <Input
                  id={`target-${h.isin}`}
                  inputMode="decimal"
                  placeholder="0"
                  value={values[h.isin] ?? ''}
                  onChange={(event) =>
                    setValues((prev) => ({ ...prev, [h.isin]: event.target.value.replace(',', '.') }))
                  }
                  className="tabular pr-6 text-right"
                />
                <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-subtle-foreground">
                  %
                </span>
              </div>
            </div>
          ))}

          <div className="flex items-center justify-between border-t border-border pt-2.5 text-[12.5px]">
            <span className="text-subtle-foreground">Unassigned</span>
            <span className={cn('tabular', remaining < -0.01 ? 'text-destructive' : 'text-muted-foreground')}>
              {remaining.toFixed(1)}%
            </span>
          </div>

          {error && <p className="text-[13px] text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={setTargets.isPending}>
              {setTargets.isPending ? 'Saving…' : 'Save targets'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
