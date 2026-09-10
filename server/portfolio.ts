import { addDays, format, parseISO } from 'date-fns'
import type { OrderKind } from '../shared/schemas.ts'
import type { DB } from './db.ts'

export interface FundRow {
  isin: string
  name: string
  shortName: string | null
  ftXid: string | null
  resolvedAt: string | null
  targetBps: number
  sortOrder: number
  createdAt: string
}

export interface OrderRow {
  id: string
  brokerOperationId: string
  isin: string
  kind: OrderKind
  tradedOn: string
  settledOn: string
  shareUnits: number
  navMicros: number
  amountCents: number
  createdAt: string
}

export interface PriceRow {
  isin: string
  pricedOn: string
  navMicros: number
  source: 'ft' | 'order'
}

export interface Holding {
  isin: string
  name: string
  shortName: string | null
  shares: number
  costBasisCents: number
  navMicros: number | null
  navAsOf: string | null
  valueCents: number
  gainCents: number
  gainPercent: number | null
  targetBps: number
  weightBps: number
  driftBps: number
  toTargetCents: number
}

export interface PortfolioPoint {
  date: string
  valueCents: number
  contributedCents: number
  twrIndex: number
}

export interface MonthlyContribution {
  month: string
  boughtCents: number
  soldCents: number
  netCents: number
}

// Scale factors matching migrations/0005_investments.sql.
const SHARE_SCALE = 100_000_000
const NAV_SCALE = 1_000_000

const isBuySide = (kind: OrderKind) => kind === 'buy' || kind === 'transferIn'
const isSellSide = (kind: OrderKind) => kind === 'sell' || kind === 'transferOut'
/** Only buy/sell are real cash moving in or out of the portfolio — a
 *  traspaso between funds carries no new money. */
const isExternal = (kind: OrderKind) => kind === 'buy' || kind === 'sell'

function groupBy<T, K>(rows: T[], key: (row: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>()
  for (const row of rows) {
    const list = map.get(key(row))
    if (list) list.push(row)
    else map.set(key(row), [row])
  }
  return map
}

export async function loadFunds(db: DB): Promise<FundRow[]> {
  const { results } = await db.prepare('SELECT * FROM funds ORDER BY sortOrder, name').all<FundRow>()
  return results
}

export async function loadOrders(db: DB): Promise<OrderRow[]> {
  const { results } = await db
    .prepare('SELECT * FROM investmentOrders ORDER BY tradedOn, createdAt')
    .all<OrderRow>()
  return results
}

export async function loadPrices(db: DB): Promise<PriceRow[]> {
  const { results } = await db.prepare('SELECT * FROM fundPrices ORDER BY pricedOn').all<PriceRow>()
  return results
}

/**
 * Sums external buy/sell cash as of `asOf` — the money actually put into the
 * portfolio, which is what a gain is measured against. Traspasos never count:
 * they move cash between funds, not into or out of the portfolio.
 */
export function netContributedCents(orders: OrderRow[], asOf: string): number {
  let total = 0
  for (const order of orders) {
    if (order.tradedOn > asOf || !isExternal(order.kind)) continue
    total += order.kind === 'buy' ? order.amountCents : -order.amountCents
  }
  return total
}

/**
 * One row per fund still held as of `asOf` — a fund sold down to zero shares
 * drops out entirely rather than showing a zero-value row. Cost basis uses
 * the average-cost method: a buy or transferIn adds its own cash to the
 * basis, a sell or transferOut removes its proportional share of it, so the
 * average cost per remaining share is unchanged by a partial sale.
 */
export function computeHoldings(
  funds: FundRow[],
  orders: OrderRow[],
  prices: PriceRow[],
  asOf: string,
): Holding[] {
  const ordersByIsin = groupBy(orders, (o) => o.isin)
  const pricesByIsin = groupBy(prices, (p) => p.isin)

  const rows: Holding[] = []
  for (const fund of funds) {
    const fundOrders = (ordersByIsin.get(fund.isin) ?? []).filter((o) => o.tradedOn <= asOf)
    if (fundOrders.length === 0) continue

    let shareUnits = 0
    let costBasisCents = 0
    for (const order of fundOrders) {
      if (isBuySide(order.kind)) {
        shareUnits += order.shareUnits
        costBasisCents += order.amountCents
      } else if (isSellSide(order.kind)) {
        const proportion = shareUnits > 0 ? Math.min(1, order.shareUnits / shareUnits) : 0
        costBasisCents -= Math.round(costBasisCents * proportion)
        shareUnits -= order.shareUnits
      }
    }
    if (shareUnits <= 0) continue

    const latest = (pricesByIsin.get(fund.isin) ?? [])
      .filter((p) => p.pricedOn <= asOf)
      .reduce<PriceRow | null>((best, p) => (!best || p.pricedOn > best.pricedOn ? p : best), null)

    const shares = shareUnits / SHARE_SCALE
    const navMicros = latest?.navMicros ?? null
    // No price yet for a just-imported fund: value at cost rather than
    // showing a hole in the total until the first sync lands.
    const valueCents = navMicros ? Math.round(shares * (navMicros / NAV_SCALE) * 100) : costBasisCents
    const gainCents = valueCents - costBasisCents

    rows.push({
      isin: fund.isin,
      name: fund.name,
      shortName: fund.shortName,
      shares,
      costBasisCents,
      navMicros,
      navAsOf: latest?.pricedOn ?? null,
      valueCents,
      gainCents,
      gainPercent: costBasisCents > 0 ? (gainCents / costBasisCents) * 100 : null,
      targetBps: fund.targetBps,
      weightBps: 0,
      driftBps: 0,
      toTargetCents: 0,
    })
  }

  const totalValueCents = rows.reduce((sum, r) => sum + r.valueCents, 0)
  for (const row of rows) {
    row.weightBps = totalValueCents > 0 ? Math.round((row.valueCents / totalValueCents) * 10000) : 0
    row.driftBps = row.weightBps - row.targetBps
    row.toTargetCents = Math.round((row.targetBps / 10000) * totalValueCents) - row.valueCents
  }

  rows.sort((a, b) => b.valueCents - a.valueCents)
  return rows
}

/**
 * The portfolio's value, cumulative contribution and time-weighted return
 * for every day from the first order through `throughDate`. Walks the whole
 * range once with a running pointer per fund into its own orders and prices
 * (both already sorted ascending) rather than re-scanning from scratch each
 * day.
 *
 * TWR only moves on a day's *return*: `r = (value - flow) / previousValue -
 * 1`, chain-linked into `twrIndex`, so a traspaso (which is not an external
 * flow) changes value without ever registering as a gain or loss, and a
 * contribution buys shares without registering as a return either.
 */
export function dailySeries(
  funds: FundRow[],
  orders: OrderRow[],
  prices: PriceRow[],
  throughDate: string,
): PortfolioPoint[] {
  if (orders.length === 0) return []

  const startDate = orders.reduce((min, o) => (o.tradedOn < min ? o.tradedOn : min), orders[0]!.tradedOn)
  const isins = [...new Set(funds.map((f) => f.isin))]
  const ordersByIsin = groupBy(orders, (o) => o.isin)
  const pricesByIsin = groupBy(prices, (p) => p.isin)
  const flowsByDate = groupBy(
    orders.filter((o) => isExternal(o.kind)),
    (o) => o.tradedOn,
  )

  const orderPtr = new Map(isins.map((isin) => [isin, 0]))
  const pricePtr = new Map(isins.map((isin) => [isin, 0]))
  const shareUnitsByIsin = new Map<string, number>(isins.map((isin) => [isin, 0]))
  const navMicrosByIsin = new Map<string, number | null>(isins.map((isin) => [isin, null]))

  const points: PortfolioPoint[] = []
  let cumulativeContributed = 0
  let prevValue = 0
  let twrIndex = 1

  let cursor = parseISO(startDate)
  const end = parseISO(throughDate)

  while (cursor <= end) {
    const dateStr = format(cursor, 'yyyy-MM-dd')

    for (const isin of isins) {
      const orderList = ordersByIsin.get(isin) ?? []
      let idx = orderPtr.get(isin)!
      let shares = shareUnitsByIsin.get(isin)!
      while (idx < orderList.length && orderList[idx]!.tradedOn <= dateStr) {
        const order = orderList[idx]!
        shares += isBuySide(order.kind) ? order.shareUnits : -order.shareUnits
        idx += 1
      }
      orderPtr.set(isin, idx)
      shareUnitsByIsin.set(isin, shares)

      const priceList = pricesByIsin.get(isin) ?? []
      let pidx = pricePtr.get(isin)!
      let nav = navMicrosByIsin.get(isin)!
      while (pidx < priceList.length && priceList[pidx]!.pricedOn <= dateStr) {
        nav = priceList[pidx]!.navMicros
        pidx += 1
      }
      pricePtr.set(isin, pidx)
      navMicrosByIsin.set(isin, nav)
    }

    let valueCents = 0
    for (const isin of isins) {
      const shares = shareUnitsByIsin.get(isin)! / SHARE_SCALE
      const nav = navMicrosByIsin.get(isin)!
      if (shares > 0 && nav != null) valueCents += shares * (nav / NAV_SCALE) * 100
    }
    valueCents = Math.round(valueCents)

    let cfToday = 0
    for (const order of flowsByDate.get(dateStr) ?? []) {
      cfToday += order.kind === 'buy' ? order.amountCents : -order.amountCents
    }
    cumulativeContributed += cfToday

    if (prevValue > 0) {
      const r = (valueCents - cfToday) / prevValue - 1
      twrIndex *= 1 + r
    }
    prevValue = valueCents

    points.push({ date: dateStr, valueCents, contributedCents: cumulativeContributed, twrIndex })
    cursor = addDays(cursor, 1)
  }

  return points
}

/** External contributions and withdrawals, grouped by month. Traspasos are
 *  excluded — they move cash between funds, not into the portfolio. */
export function monthlyContributions(orders: OrderRow[]): MonthlyContribution[] {
  const byMonth = new Map<string, { bought: number; sold: number }>()
  for (const order of orders) {
    if (!isExternal(order.kind)) continue
    const month = order.tradedOn.slice(0, 7)
    const entry = byMonth.get(month) ?? { bought: 0, sold: 0 }
    if (order.kind === 'buy') entry.bought += order.amountCents
    else entry.sold += order.amountCents
    byMonth.set(month, entry)
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([month, { bought, sold }]) => ({
      month,
      boughtCents: bought,
      soldCents: sold,
      netCents: bought - sold,
    }))
}
