import { Suspense, useState } from 'react'
import { motion } from 'motion/react'
import { Outlet, useLocation } from 'react-router'
import { DitherField } from '@/components/brand/DitherField'
import { GridMarkPulse } from '@/components/brand/GridMark'
import { Sidebar } from '@/components/layout/Sidebar'
import { BottomNav } from '@/components/layout/BottomNav'
import { CommandPalette } from '@/components/command/CommandPalette'
import { EntryDialog } from '@/features/transactions/EntryDialog'
import { AccountDialog } from '@/features/accounts/AccountDialog'
import { CategoryDialog } from '@/features/categories/CategoryDialog'
import { useQuickActions } from '@/features/quick-actions/QuickActions'
import { DURATION, EASE } from '@/lib/motion'

const STORAGE_KEY = 'ledgr-nav-collapsed'

function readInitialCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function AppShell() {
  const location = useLocation()
  const { dialog, close } = useQuickActions()
  const [collapsed, setCollapsed] = useState(readInitialCollapsed)

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
      } catch {
        // Private browsing; the choice simply will not persist.
      }
      return next
    })
  }

  return (
    /* Column on a phone so the bar can hold the bottom edge, row from `md` up
       where the rail takes the left. The two navigations are exclusive: only
       one is ever mounted at a width. */
    <div className="relative isolate flex h-dvh flex-col overflow-hidden bg-background md:flex-row">
      <div className="hidden md:flex">
        <Sidebar collapsed={collapsed} onToggle={toggleCollapsed} />
      </div>

      {/* Inset, not flush: a small gap on every side lets the content take a
          full rounded corner set even sitting right against the flat
          sidebar, the way a card sits on the page behind it rather than
          being the page. The inset is desktop-only — on a phone that margin
          and its corners cost width the content needs more. */}
      <div className="flex min-h-0 min-w-0 flex-1 md:p-2 md:pl-0">
        {/* `isolate` is load-bearing: without a stacking context here the
            dither's negative z-index escapes to the root and paints under
            this card's own background instead of on top of it. */}
        <div className="relative isolate flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-border bg-card md:rounded-2xl md:border">
          {/* The ground is not flat: a light source past the top-right
              corner, under the page content but inside the card itself, so
              the dither reads on the surface people actually look at instead
              of the margin around it. */}
          <DitherField
            origin={[1.04, -0.1]}
            radius={0.75}
            intensity={0.7}
            scale={0.45}
            className="absolute inset-0 -z-10 opacity-[0.22]"
          />

          <main className="flex-1 overflow-y-auto">
            {/* Enter only. Waiting for an exit before the next page appears is
                a delay on an action taken dozens of times a day. */}
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: DURATION.fast, ease: EASE.out }}
              className="mx-auto w-full max-w-[1400px] px-4 py-4 md:px-6 md:py-6"
            >
              <Suspense
                fallback={
                  <div className="grid min-h-[60vh] place-items-center">
                    <GridMarkPulse size={26} className="text-muted-foreground" />
                  </div>
                }
              >
                <Outlet />
              </Suspense>
            </motion.div>
          </main>
        </div>
      </div>

      <BottomNav />

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
      <CategoryDialog
        open={dialog.type === 'category'}
        kind={dialog.type === 'category' ? dialog.kind : 'expense'}
        onClose={close}
      />
    </div>
  )
}
