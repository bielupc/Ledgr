import { useState } from 'react'
import { motion } from 'motion/react'
import { Archive, ArchiveRestore, Pencil, Plus, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/empty/EmptyState'
import { Money } from '@/components/brand/Money'
import { DynamicIcon } from '@/components/brand/DynamicIcon'
import { PanelLoading } from '@/components/charts/Panel'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { RowAction } from '@/components/table/RowActions'
import { AccountDialog } from '@/features/accounts/AccountDialog'
import { useAccounts, useDeleteAccount, useRestoreAccount } from '@/features/accounts/hooks'
import { fadeUp, stagger, transition } from '@/lib/motion'
import { cn } from '@/lib/utils'
import type { AccountBalance } from '@shared/types.ts'

const NO_ROWS: AccountBalance[] = []

/*
 * The dashboard's palette, keyed the same way: an account's hue comes from its
 * place in the list, so the colour that marks it in the net-worth block marks
 * it here too. Held to a ring and a tint rather than a fill — seven saturated
 * cards would overrun the brand's 78/18/4 proportion on their own. Past the
 * fifth account the tone falls back to `--chart-other`, because five is how
 * many of these hues can be told apart — see the token block in globals.css.
 *
 * `--chart-cat-*`, not `--chart-*`. An account is an arbitrary thing being
 * told apart from other arbitrary things, which is what the category-safe arcs
 * are for; `--chart-*` spends green, red and blue on income, expense and net
 * worth, and an account wearing one reads as a direction. It is also the set
 * `AccountsPanel` encodes with, so the two screens now genuinely agree — the
 * claim above was false while this list pointed at the other palette.
 */
const TONES = [
  'var(--chart-cat-1)',
  'var(--chart-cat-2)',
  'var(--chart-cat-3)',
  'var(--chart-cat-4)',
  'var(--chart-cat-5)',
]

export default function Accounts() {
  const accounts = useAccounts(true)
  const remove = useDeleteAccount()
  const restore = useRestoreAccount()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<AccountBalance | undefined>()
  const [archiving, setArchiving] = useState<AccountBalance | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  const all = accounts.data ?? NO_ROWS
  const inApiOrder = all.filter((row) => !row.deletedAt)
  // Keyed to the live list in the API's own order, which is exactly what the
  // dashboard block keys on. Counting archived rows in, or sorting by balance
  // first, would give the same account a different hue on the two screens.
  const tones = new Map(
    inApiOrder.map((row, index) => [row.id, TONES[index] ?? 'var(--chart-other)']),
  )
  const live = [...inApiOrder].sort((a, b) => b.balanceCents - a.balanceCents)
  const archived = all.filter((row) => row.deletedAt)

  const open = (account?: AccountBalance) => {
    setEditing(account)
    setDialogOpen(true)
  }

  return (
    <motion.div variants={stagger()} initial="hidden" animate="visible" className="flex flex-col gap-4">
      <PageHeader title="Accounts">
        <Button className="gap-1.5" onClick={() => open()}>
          <Plus className="size-4" strokeWidth={2.25} />
          Add account
        </Button>
      </PageHeader>

      {accounts.isLoading ? (
        <PanelLoading height={240} />
      ) : live.length === 0 ? (
        <motion.div
          variants={fadeUp}
          transition={transition}
          className="flex flex-col overflow-hidden rounded-xl border border-border bg-card"
        >
          <EmptyState
            icon={Wallet}
            title="No accounts yet"
            description=""
            actionLabel="Add an account"
            onAction={() => open()}
          />
        </motion.div>
      ) : (
        /* auto-fit rather than a fixed column count: a ledger has four accounts
           or nine, and either way the last row fills instead of leaving a
           half-empty cell at the end. */
        <div className="grid grid-cols-[repeat(auto-fit,minmax(248px,1fr))] gap-3">
          {live.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              tone={tones.get(account.id)!}
              onEdit={() => open(account)}
              onArchive={() => setArchiving(account)}
            />
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <motion.section variants={fadeUp} transition={transition} className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setShowArchived((open) => !open)}
            className="flex w-fit items-center gap-2 text-[12.5px] text-muted-foreground transition-colors duration-150 hoverfine:text-foreground"
          >
            <Archive className="size-3.5" strokeWidth={1.75} />
            {archived.length} archived {archived.length === 1 ? 'account' : 'accounts'}
            <span className={cn('text-subtle-foreground', showArchived && 'text-foreground')}>
              {showArchived ? 'Hide' : 'Show'}
            </span>
          </button>

          {showArchived && (
            <ul className="grid grid-cols-[repeat(auto-fit,minmax(248px,1fr))] gap-3">
              {archived.map((account) => (
                <li
                  key={account.id}
                  className="group flex items-center gap-3 rounded-xl border border-dashed border-border px-3.5 py-3"
                >
                  <DynamicIcon
                    name={account.icon}
                    className="size-4 shrink-0 text-subtle-foreground"
                  />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
                    {account.name}
                  </span>
                  <Money
                    cents={account.balanceCents}
                    className="shrink-0 text-[12.5px] text-muted-foreground"
                  />
                  <RowAction
                    icon={ArchiveRestore}
                    label="Restore"
                    onClick={() => restore.mutate(account.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </motion.section>
      )}

      <AccountDialog
        open={dialogOpen}
        account={editing}
        onClose={() => {
          setDialogOpen(false)
          setEditing(undefined)
        }}
      />

      <ConfirmDialog
        open={archiving !== null}
        onOpenChange={(next) => !next && setArchiving(null)}
        title={`Archive ${archiving?.name ?? 'this account'}?`}
        description="It leaves every picker and stops counting toward net worth, but its transactions and transfers stay exactly as they are and keep naming it in past months. Any recurring rules posting to it are paused. You can restore it later."
        confirmLabel="Archive"
        onConfirm={() => {
          if (archiving) remove.mutate(archiving.id)
          setArchiving(null)
        }}
      />
    </motion.div>
  )
}

function AccountCard({
  account,
  tone,
  onEdit,
  onArchive,
}: {
  account: AccountBalance
  tone: string
  onEdit: () => void
  onArchive: () => void
}) {
  return (
    <motion.article
      variants={fadeUp}
      transition={transition}
      style={{ '--seg': tone } as React.CSSProperties}
      className="group relative isolate flex flex-col gap-4 overflow-hidden rounded-xl border border-border bg-card p-4 transition-[border-color,scale] duration-150 ease-[var(--ease-out-brand)] hoverfine:border-border-strong"
    >
      {/* The hue arrives as light off the top-left corner rather than as a
          filled card, so a wall of accounts stays Carbon with colour in it. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-16 -left-16 -z-10 size-40 rounded-full opacity-0 blur-2xl transition-opacity duration-300 ease-[var(--ease-out-brand)] group-hoverfine:opacity-100 [background:radial-gradient(circle,var(--seg),transparent_70%)]"
      />

      <header className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-surface transition-[border-color,background-color,scale] duration-150 ease-[var(--ease-out-brand)] group-hoverfine:scale-105 [border-color:color-mix(in_srgb,var(--seg)_32%,transparent)] group-hoverfine:[background-color:color-mix(in_srgb,var(--seg)_14%,transparent)] group-hoverfine:[border-color:var(--seg)]">
          <DynamicIcon
            name={account.icon}
            className="size-4 text-muted-foreground transition-colors duration-150 group-hoverfine:[color:var(--seg)]"
          />
        </span>

        <span className="min-w-0 flex-1 pt-1 text-[13.5px] leading-tight font-medium">
          <span className="line-clamp-2">{account.name}</span>
        </span>

        <span className="flex shrink-0 gap-1">
          <RowAction icon={Pencil} label="Edit" onClick={onEdit} />
          <RowAction icon={Archive} label="Archive" tone="destructive" onClick={onArchive} />
        </span>
      </header>

      <Money cents={account.balanceCents} className="display-tight text-[25px] leading-none" />
    </motion.article>
  )
}
