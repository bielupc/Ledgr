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
import { useCreateCategory, useUpdateCategory } from '@/features/categories/hooks'
import type { CategoryKind } from '@shared/schemas.ts'
import type { Category } from '@shared/types.ts'

export function CategoryDialog({
  open,
  kind,
  category,
  onClose,
}: {
  open: boolean
  kind: CategoryKind
  /** Present when renaming or re-iconing an existing category. */
  category?: Category
  onClose: () => void
}) {
  /*
   * Callers drop their editing row in the same tick they ask for a close, but
   * the dialog is still animating out. Holding the last row keeps the title and
   * submit label showing the edit on the way out rather than flashing back to
   * "New category" for the length of the exit.
   */
  const [lastCategory, setLastCategory] = useState(category)
  const held = open ? category : lastCategory

  const [name, setName] = useState('')
  const [icon, setIcon] = useState('tag')
  const [error, setError] = useState<string | null>(null)

  const create = useCreateCategory()
  const update = useUpdateCategory()
  const pending = create.isPending || update.isPending

  useEffect(() => {
    if (open) setLastCategory(category)
  }, [open, category])

  useEffect(() => {
    if (!open) return
    setError(null)
    setName(held?.name ?? '')
    setIcon(held?.icon ?? 'tag')
  }, [open, held])

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return setError('Give the category a name')

    const settle = (message: string) => ({
      onSuccess: () => {
        toast.success(message)
        onClose()
      },
      onError: (mutationError: Error) => setError(mutationError.message),
    })

    // Kind is fixed after creation: the expense and income lists are separate,
    // and moving a category between them would change what every transaction
    // already filed under it means.
    if (held) {
      return update.mutate(
        { id: held.id, input: { name: name.trim(), icon } },
        settle(`${name.trim()} updated`),
      )
    }
    create.mutate({ name: name.trim(), icon, kind, sortOrder: 0 }, settle(`${name.trim()} added`))
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <IconPicker
              value={icon}
              onChange={(next) => setIcon(next ?? 'tag')}
              allowInherit={false}
            />
            <DialogTitle>
              {held ? 'Edit' : 'New'} {kind} category
            </DialogTitle>
          </div>
          <DialogDescription className="sr-only">
            Name the category and choose the icon its rows carry.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="category-name">Name</Label>
            <Input
              id="category-name"
              autoFocus
              placeholder={kind === 'expense' ? 'Groceries' : 'Salary'}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          {error && <p className="text-[13px] text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : held ? 'Save changes' : 'Add category'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
