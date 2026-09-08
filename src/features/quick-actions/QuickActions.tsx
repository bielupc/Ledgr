import { createContext, use, useCallback, useMemo, useState } from 'react'
import type { CategoryKind } from '@shared/schemas.ts'

type QuickDialog =
  | { type: 'none' }
  | { type: 'transaction'; kind: CategoryKind }
  | { type: 'transfer' }
  | { type: 'account' }
  | { type: 'category'; kind: CategoryKind }

interface QuickActionsValue {
  dialog: QuickDialog
  commandOpen: boolean
  setCommandOpen: (open: boolean) => void
  openTransaction: (kind: CategoryKind) => void
  openTransfer: () => void
  openAccount: () => void
  openCategory: (kind: CategoryKind) => void
  close: () => void
}

const QuickActionsContext = createContext<QuickActionsValue | null>(null)

export function QuickActionsProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<QuickDialog>({ type: 'none' })
  const [commandOpen, setCommandOpen] = useState(false)

  const value = useMemo<QuickActionsValue>(
    () => ({
      dialog,
      commandOpen,
      setCommandOpen,
      openTransaction: (kind) => {
        setCommandOpen(false)
        setDialog({ type: 'transaction', kind })
      },
      openTransfer: () => {
        setCommandOpen(false)
        setDialog({ type: 'transfer' })
      },
      openAccount: () => {
        setCommandOpen(false)
        setDialog({ type: 'account' })
      },
      openCategory: (kind) => {
        setCommandOpen(false)
        setDialog({ type: 'category', kind })
      },
      close: () => setDialog({ type: 'none' }),
    }),
    [dialog, commandOpen],
  )

  return <QuickActionsContext value={value}>{children}</QuickActionsContext>
}

export function useQuickActions(): QuickActionsValue {
  const context = use(QuickActionsContext)
  if (!context) throw new Error('useQuickActions must be used inside QuickActionsProvider')
  return context
}

/** Shared by every amount field: accepts a comma or a dot as the separator. */
export function useAmountParser() {
  return useCallback((raw: string): number | null => {
    const normalised = raw.replace(/\s/g, '').replace(',', '.')
    const value = Number(normalised)
    if (!Number.isFinite(value) || value <= 0) return null
    return Math.round(value * 100)
  }, [])
}
