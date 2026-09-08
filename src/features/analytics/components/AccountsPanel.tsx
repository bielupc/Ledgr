import { useState } from 'react'
import { Plus, Wallet } from 'lucide-react'
import { Panel, PanelLoading } from '@/components/charts/Panel'
import { PanelAction } from '@/components/charts/PanelAction'
import { EmptyState } from '@/components/empty/EmptyState'
import { DitherField } from '@/components/brand/DitherField'
import { Money } from '@/components/brand/Money'
import { ShareGrid } from '@/components/brand/ShareGrid'
import { useAccounts } from '@/features/accounts/hooks'
import { useQuickActions } from '@/features/quick-actions/QuickActions'
import { resolveIcon } from '@/lib/icons'
import { allocateCells } from '@/lib/allocate'

/*
 * The categorical palette in its fixed order, keyed to the account's own place
 * in the list rather than to its rank by balance, so a month's spending re-sorts
 * the rows without repainting them. An eighth account folds into the neutral
 * slot; it does not get a new hue.
 *
 * Held well back from full chroma at rest: seven saturated hues would take over
 * the card and overrun the brand's 78/18/4 proportion. Inspecting one lifts it
 * to full strength, which is the only place the palette is spent in full.
 *
 * Drawn from the category-safe set: an account is an arbitrary identity here,
 * not a sign, so red/blue/green stay reserved for expense/net worth/income.
 */
const TONES = [
  'var(--chart-cat-1)',
  'var(--chart-cat-2)',
  'var(--chart-cat-3)',
  'var(--chart-cat-4)',
  'var(--chart-cat-5)',
  'var(--chart-cat-6)',
  'var(--chart-cat-7)',
]
const toneFor = (index: number) => TONES[index] ?? 'var(--chart-other)'

export function AccountsPanel() {
  const accounts = useAccounts()
  const { openAccount } = useQuickActions()
  const [active, setActive] = useState<string | null>(null)

  const rows = accounts.data ?? []
  const tones = new Map(rows.map((account, index) => [account.id, toneFor(index)]))
  const ranked = [...rows].sort((a, b) => b.balanceCents - a.balanceCents)

  const segments = ranked.map((account) => ({
    id: account.id,
    tone: tones.get(account.id)!,
    value: account.balanceCents,
  }))
  // The row figure is the account's cell count, so the block and the number are
  // the same rounding rather than two that can disagree by a point.
  const shares = allocateCells(
    segments.map((segment) => segment.value),
    100,
  )

  return (
    <Panel title="Balances">
      {accounts.isLoading ? (
        <PanelLoading height={200} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No accounts yet"
          description="Add the accounts you hold and their balances roll into net worth automatically."
          actionLabel="Add an account"
          onAction={openAccount}
          size="sm"
        />
      ) : (
        <>
          <DitherField
            origin={[0.86, 1.12]}
            radius={0.78}
            intensity={0.62}
            scale={0.7}
            className="absolute inset-0 -z-10 opacity-[0.4] [mask-image:linear-gradient(to_top,black_0%,black_34%,transparent_82%)]"
          />

          {/* One hundred cells, one percent each. The whole is the net worth the
              accounts add up to, so the block answers the distribution question
              before any row is read. */}
          <div className="px-2 pt-0.5 pb-3.5">
            <ShareGrid segments={segments} rows={4} columns={25} activeId={active} onActive={setActive} />
          </div>

          <ul className="flex flex-col px-1">
            {ranked.map((account, index) => {
              const Icon = resolveIcon(account.icon)
              const dim = active !== null && active !== account.id

              return (
                <li
                  key={account.id}
                  onMouseEnter={() => setActive(account.id)}
                  onMouseLeave={() => setActive(null)}
                  data-dim={dim || undefined}
                  className="group flex items-center gap-3 rounded-lg px-2 py-[7px] transition-[background-color,opacity] duration-150 ease-[var(--ease-out-brand)] data-dim:opacity-45 hoverfine:bg-muted/60"
                  style={{ '--seg': tones.get(account.id) } as React.CSSProperties}
                >
                  {/* The tile takes the account's step in the ramp, which is
                      what ties the row to its run of cells. Faint at rest so
                      the card stays quiet; only the inspected row lights. */}
                  <span className="grid size-7 shrink-0 place-items-center rounded-md border bg-surface transition-[border-color,background-color,scale] duration-150 ease-[var(--ease-out-brand)] group-hoverfine:scale-105 [border-color:color-mix(in_srgb,var(--seg)_30%,transparent)] group-hoverfine:[background-color:color-mix(in_srgb,var(--seg)_14%,transparent)] group-hoverfine:[border-color:var(--seg)]">
                    <Icon
                      className="size-3.5 text-muted-foreground transition-colors duration-150 group-hoverfine:[color:var(--seg)]"
                      strokeWidth={1.75}
                    />
                  </span>

                  <span className="min-w-0 flex-1 truncate text-[13px]">{account.name}</span>

                  <span className="tabular w-9 shrink-0 text-right text-[11px] text-muted-foreground transition-colors duration-150 group-hoverfine:text-accent-ink">
                    {shares[index]}%
                  </span>

                  <Money
                    cents={account.balanceCents}
                    className="w-[104px] shrink-0 text-right text-[13px]"
                  />
                </li>
              )
            })}
          </ul>

          <PanelAction icon={Plus} label="Add account" onClick={openAccount} />
        </>
      )}
    </Panel>
  )
}
