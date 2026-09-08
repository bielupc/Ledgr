import { motion } from 'motion/react'
import { Outlet, useLocation } from 'react-router'
import { DitherField } from '@/components/brand/DitherField'
import { Sidebar } from '@/components/layout/Sidebar'
import { CommandPalette } from '@/components/command/CommandPalette'
import { EntryDialog } from '@/features/transactions/EntryDialog'
import { AccountDialog } from '@/features/accounts/AccountDialog'
import { useQuickActions } from '@/features/quick-actions/QuickActions'
import { DURATION, EASE } from '@/lib/motion'

export function AppShell() {
  const location = useLocation()
  const { dialog, close } = useQuickActions()

  return (
    <div className="relative isolate flex h-dvh overflow-hidden bg-background">
      {/* The ground is not flat: a light source past the top-right corner,
          under everything including the translucent sidebar. The radius stays
          tight on purpose. A broad falloff holds the Bayer threshold at a
          constant dot density, which reads as a halftone overlay across the
          whole page rather than as light. */}
      <DitherField
        origin={[1.04, -0.1]}
        radius={0.62}
        intensity={0.52}
        scale={0.45}
        className="fixed inset-0 -z-10 opacity-[0.32]"
      />

      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 overflow-y-auto">
          {/* Enter only. Waiting for an exit before the next page appears is a
              delay on an action taken dozens of times a day. */}
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATION.fast, ease: EASE.out }}
            className="mx-auto w-full max-w-[1400px] px-6 py-6"
          >
            <Outlet />
          </motion.div>
        </main>
      </div>

      <CommandPalette />

      <EntryDialog
        open={dialog.type === 'transaction' || dialog.type === 'transfer'}
        initialMode={
          dialog.type === 'transfer'
            ? 'transfer'
            : dialog.type === 'transaction'
              ? dialog.kind
              : 'expense'
        }
        onClose={close}
      />
      <AccountDialog open={dialog.type === 'account'} onClose={close} />
    </div>
  )
}
