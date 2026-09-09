import { useState } from 'react'
import { NavLink } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { Menu, Moon, Plus, Search, Sun, X } from 'lucide-react'
import { BAR_ITEMS, MORE_GROUPS } from '@/components/layout/nav'
import { useQuickActions } from '@/features/quick-actions/QuickActions'
import { useTheme } from '@/lib/theme'
import { DURATION, EASE } from '@/lib/motion'
import { cn } from '@/lib/utils'

/*
 * The phone's whole navigation, and deliberately not the sidebar reflowed. A
 * rail assumes a cursor and a lot of vertical room; a thumb has neither, so the
 * four most-used destinations sit on the bottom edge with the action the app
 * exists for raised between them, and the long tail moves into a sheet.
 *
 * Every touch target here is at least 44px, and the bar carries the home
 * indicator's inset itself so page content never has to know about it.
 */
export function BottomNav() {
  const [moreOpen, setMoreOpen] = useState(false)
  const { openTransaction, setCommandOpen } = useQuickActions()
  const { theme, toggle } = useTheme()

  return (
    <>
      <AnimatePresence>
        {moreOpen && (
          <>
            <motion.button
              type="button"
              aria-label="Close menu"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DURATION.fast, ease: EASE.out }}
              onClick={() => setMoreOpen(false)}
              className="fixed inset-0 z-40 bg-black/50 md:hidden"
            />

            {/* A sheet rather than a full screen: the tail of the nav is a short
                list, and keeping the page edge visible behind it says this is a
                detour rather than a destination. */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ duration: DURATION.base, ease: EASE.out }}
              className="fixed inset-x-0 bottom-0 z-50 flex max-h-[80dvh] flex-col overflow-y-auto rounded-t-2xl border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
            >
              <div className="flex items-center justify-between px-4 pt-4 pb-2">
                <h2 className="heading-tight text-[15px]">Menu</h2>
                <button
                  type="button"
                  aria-label="Close menu"
                  onClick={() => setMoreOpen(false)}
                  className="grid size-11 place-items-center rounded-lg text-muted-foreground"
                >
                  <X className="size-5" strokeWidth={2} />
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false)
                  setCommandOpen(true)
                }}
                className="mx-4 mb-2 flex h-11 items-center gap-2.5 rounded-lg bg-surface/60 px-3 text-[13.5px] font-medium text-muted-foreground inset-ring-1 inset-ring-border"
              >
                <Search className="size-4 shrink-0" strokeWidth={2} />
                Search
              </button>

              <nav className="flex flex-col px-2 pb-2">
                {MORE_GROUPS.map((group, index) => (
                  <div key={index} className="flex flex-col">
                    {index > 0 && <div className="my-2 h-px bg-border" />}
                    {group.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={() => setMoreOpen(false)}
                        className={({ isActive }) =>
                          cn(
                            'flex h-12 items-center gap-3 rounded-lg px-3 text-[14px] font-medium',
                            isActive ? 'bg-surface text-foreground' : 'text-muted-foreground',
                          )
                        }
                      >
                        <item.icon className="size-4.5 shrink-0" strokeWidth={1.75} />
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                ))}
              </nav>

              <button
                type="button"
                onClick={toggle}
                className="mx-2 mb-3 flex h-12 items-center gap-3 rounded-lg px-3 text-[14px] font-medium text-muted-foreground"
              >
                {theme === 'dark' ? (
                  <Sun className="size-4.5 shrink-0" strokeWidth={1.75} />
                ) : (
                  <Moon className="size-4.5 shrink-0" strokeWidth={1.75} />
                )}
                {theme === 'dark' ? 'Light' : 'Dark'} theme
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <nav className="relative z-30 flex shrink-0 items-stretch border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
        {BAR_ITEMS.slice(0, 2).map((item) => (
          <BarLink key={item.to} item={item} />
        ))}

        {/* Raised, and the only filled thing on the bar: entering an expense is
            what the app is opened for, so it is a target you can hit without
            looking rather than one tab among five. */}
        <div className="flex flex-1 items-center justify-center">
          <button
            type="button"
            aria-label="Add expense"
            onClick={() => openTransaction('expense')}
            className="-mt-5 grid size-14 place-items-center rounded-full bg-emerald text-white shadow-lg shadow-emerald/25 transition-[scale] duration-150 ease-[var(--ease-out-brand)] active:scale-[0.94]"
          >
            <Plus className="size-6" strokeWidth={2.5} />
          </button>
        </div>

        {BAR_ITEMS.slice(2).map((item) => (
          <BarLink key={item.to} item={item} />
        ))}

        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-expanded={moreOpen}
          className="flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 py-2 text-subtle-foreground"
        >
          {/* Matches a tab's icon slot so the row of labels sits on one line,
              even though this one opens a sheet rather than a route. */}
          <span className="grid h-7 w-12 place-items-center">
            <Menu className="size-5" strokeWidth={1.75} />
          </span>
          <span className="text-[10px] font-medium">More</span>
        </button>
      </nav>
    </>
  )
}

function BarLink({ item }: { item: (typeof BAR_ITEMS)[number] }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cn(
          'flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 py-2 transition-colors duration-150',
          isActive ? 'text-accent-ink' : 'text-subtle-foreground',
        )
      }
    >
      {({ isActive }) => (
        <>
          {/* The capsule slides between tabs rather than blinking on and off,
              so the bar shows where you came from as well as where you are.
              Its own layoutId, not the rail's: the sidebar stays mounted at
              this width behind `display:none`, and sharing an id would make
              Motion animate the pill between two elements at once. */}
          <span className="relative grid h-7 w-12 place-items-center">
            {isActive && (
              <motion.span
                layoutId="bottom-nav-active"
                transition={{ duration: DURATION.base, ease: EASE.out }}
                className="absolute inset-0 rounded-full bg-emerald/15"
              />
            )}
            <item.icon
              className="relative size-5"
              strokeWidth={isActive ? 2.25 : 1.75}
            />
          </span>
          <span className="text-[10px] font-medium">{item.label}</span>
        </>
      )}
    </NavLink>
  )
}
