import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BrokerOrderParseError, mapBrokerRow, mapBrokerRows } from '../shared/brokerOrders.ts'
import { newId, type DB } from '../server/db.ts'
import {
  computeHoldings,
  dailySeries,
  monthlyContributions,
  netContributedCents,
  type FundRow,
  type OrderRow,
  type PriceRow,
} from '../server/portfolio.ts'
import { fetchFtHistory, parseFtHistory, resolveFund, syncFundPrices } from '../server/prices.ts'

const db: DB = env.DB

async function resetTables() {
  await db.batch([
    db.prepare('DELETE FROM investmentOrders'),
    db.prepare('DELETE FROM fundPrices'),
    db.prepare('DELETE FROM funds'),
    db.prepare("DELETE FROM meta WHERE key = 'pricesSyncedAt'"),
  ])
}

beforeEach(resetTables)

/* Fixed 11-column row, MyInvestor's real export order — see
   shared/brokerOrders.ts for the layout comment. */
function row(
  tradedOn: string,
  settledOn: string,
  operationId: string,
  operationType: string,
  isin: string,
  fundName: string,
  shares: string,
  nav: string,
  amount: string,
): string[] {
  return [
    tradedOn,
    settledOn,
    operationId,
    'FONDOS EXTRANJEROS',
    operationType,
    isin,
    fundName,
    shares,
    'EUR',
    nav,
    amount,
  ]
}

describe('mapBrokerRow', () => {
  it('maps every known operation type', () => {
    const cases: [string, string][] = [
      ['SUSCRIPCION', 'buy'],
      ['REEMBOLSO', 'sell'],
      ['COMPRA', 'buy'],
      ['VENTA', 'sell'],
      ['SUSCR.POR TRASPASO I', 'transferIn'],
      ['REEMB.POR TRASPASO I', 'transferOut'],
      ['ALTA IIC SWITCH', 'transferIn'],
      ['BAJA IIC SWITCH', 'transferOut'],
    ]
    for (const [type, kind] of cases) {
      const order = mapBrokerRow(
        row('2025-01-01', '2025-01-02', 'op1', type, 'IE00BYX5NX33', 'MSCI WORLD', '1.00000000', '10.0000000', '10.00'),
        1,
      )
      expect(order.kind).toBe(kind)
    }
  })

  it('rejects an unrecognised operation type rather than guessing', () => {
    expect(() =>
      mapBrokerRow(
        row('2025-01-01', '2025-01-02', 'op1', 'ALGO NUEVO', 'IE00BYX5NX33', 'MSCI WORLD', '1', '10', '10'),
        7,
      ),
    ).toThrow(BrokerOrderParseError)
    expect(() =>
      mapBrokerRow(
        row('2025-01-01', '2025-01-02', 'op1', 'ALGO NUEVO', 'IE00BYX5NX33', 'MSCI WORLD', '1', '10', '10'),
        7,
      ),
    ).toThrow(/row 7/i)
  })

  it('parses shares as an exact scaled integer, not a float approximation', () => {
    const order = mapBrokerRow(
      row('2025-01-01', '2025-01-02', 'op1', 'SUSCRIPCION', 'ES0165243025', 'MYINVESTOR VALUE', '558.82000350', '1.2093301', '675.80'),
      1,
    )
    expect(order.shareUnits).toBe(55_882_000_350)
    expect(order.amountCents).toBe(67_580)
  })
})

describe('a position closes to exactly zero shares', () => {
  it('when a traspaso in and a traspaso out cover the exact same total', () => {
    // The real ES0165243025 history: bought via two traspaso-in orders, then
    // sold entirely via one traspaso-out for precisely their sum.
    const orders = mapBrokerRows([
      row('2025-06-11', '2025-06-09', 'a', 'SUSCR.POR TRASPASO I', 'ES0165243025', 'MYINVESTOR VALUE', '375.48919250', '1.0293239', '386.50'),
      row('2025-10-15', '2025-10-14', 'b', 'SUSCRIPCION', 'ES0165243025', 'MYINVESTOR VALUE', '183.33081100', '1.0909241', '200.00'),
      row('2026-01-23', '2026-01-23', 'c', 'REEMB.POR TRASPASO I', 'ES0165243025', 'MYINVESTOR VALUE', '558.82000350', '1.2093301', '675.80'),
    ])

    const netShares = orders.reduce(
      (sum, o) => sum + (o.kind === 'sell' || o.kind === 'transferOut' ? -o.shareUnits : o.shareUnits),
      0,
    )
    expect(netShares).toBe(0)

    const fund: FundRow = {
      isin: 'ES0165243025',
      name: 'MyInvestor Value',
      shortName: null,
      ftXid: null,
      resolvedAt: null,
      targetBps: 0,
      sortOrder: 0,
      createdAt: '',
    }
    const orderRows: OrderRow[] = orders.map((o, i) => ({
      id: `o${i}`,
      brokerOperationId: o.brokerOperationId,
      isin: o.isin,
      kind: o.kind,
      tradedOn: o.tradedOn,
      settledOn: o.settledOn,
      shareUnits: o.shareUnits,
      navMicros: o.navMicros,
      amountCents: o.amountCents,
      createdAt: '',
    }))

    const holdings = computeHoldings([fund], orderRows, [], '2026-12-31')
    expect(holdings).toHaveLength(0)
  })
})

describe('computeHoldings', () => {
  it('sizes weight, drift and to-target off the live value', () => {
    const funds: FundRow[] = [
      { isin: 'A', name: 'A', shortName: null, ftXid: null, resolvedAt: null, targetBps: 7000, sortOrder: 0, createdAt: '' },
      { isin: 'B', name: 'B', shortName: null, ftXid: null, resolvedAt: null, targetBps: 3000, sortOrder: 1, createdAt: '' },
    ]
    const orders: OrderRow[] = [
      { id: '1', brokerOperationId: '1', isin: 'A', kind: 'buy', tradedOn: '2025-01-01', settledOn: '2025-01-01', shareUnits: 100_00000000, navMicros: 10_000000, amountCents: 100_000, createdAt: '' },
      { id: '2', brokerOperationId: '2', isin: 'B', kind: 'buy', tradedOn: '2025-01-01', settledOn: '2025-01-01', shareUnits: 100_00000000, navMicros: 10_000000, amountCents: 100_000, createdAt: '' },
    ]
    const prices: PriceRow[] = [
      { isin: 'A', pricedOn: '2025-01-01', navMicros: 10_000000, source: 'order' },
      { isin: 'B', pricedOn: '2025-01-01', navMicros: 10_000000, source: 'order' },
    ]

    const holdings = computeHoldings(funds, orders, prices, '2025-06-01')
    expect(holdings).toHaveLength(2)
    // Equal value, so both sit at 50% weight regardless of their targets.
    expect(holdings.every((h) => h.weightBps === 5000)).toBe(true)
    const a = holdings.find((h) => h.isin === 'A')!
    expect(a.driftBps).toBe(-2000) // 50% actual vs 70% target
    expect(a.toTargetCents).toBeGreaterThan(0) // under target: buy more
  })
})

describe('netContributedCents and monthlyContributions', () => {
  const orders: OrderRow[] = [
    { id: '1', brokerOperationId: '1', isin: 'A', kind: 'buy', tradedOn: '2025-01-05', settledOn: '2025-01-05', shareUnits: 1, navMicros: 1, amountCents: 10_000, createdAt: '' },
    { id: '2', brokerOperationId: '2', isin: 'A', kind: 'sell', tradedOn: '2025-01-20', settledOn: '2025-01-20', shareUnits: 1, navMicros: 1, amountCents: 3_000, createdAt: '' },
    { id: '3', brokerOperationId: '3', isin: 'A', kind: 'transferOut', tradedOn: '2025-02-01', settledOn: '2025-02-01', shareUnits: 1, navMicros: 1, amountCents: 50_000, createdAt: '' },
    { id: '4', brokerOperationId: '4', isin: 'B', kind: 'transferIn', tradedOn: '2025-02-01', settledOn: '2025-02-01', shareUnits: 1, navMicros: 1, amountCents: 50_000, createdAt: '' },
  ]

  it('excludes traspasos from net contributed', () => {
    expect(netContributedCents(orders, '2025-12-31')).toBe(10_000 - 3_000)
  })

  it('excludes traspasos from monthly contributions', () => {
    const months = monthlyContributions(orders)
    expect(months).toEqual([
      { month: '2025-01', boughtCents: 10_000, soldCents: 3_000, netCents: 7_000 },
    ])
  })
})

describe('dailySeries', () => {
  it('leaves TWR at 0% when a buy is followed by a flat NAV', () => {
    const funds: FundRow[] = [
      { isin: 'A', name: 'A', shortName: null, ftXid: null, resolvedAt: null, targetBps: 0, sortOrder: 0, createdAt: '' },
    ]
    const orders: OrderRow[] = [
      { id: '1', brokerOperationId: '1', isin: 'A', kind: 'buy', tradedOn: '2025-01-01', settledOn: '2025-01-01', shareUnits: 1_00000000, navMicros: 10_000000, amountCents: 1_000, createdAt: '' },
    ]
    const prices: PriceRow[] = [
      { isin: 'A', pricedOn: '2025-01-01', navMicros: 10_000000, source: 'order' },
      { isin: 'A', pricedOn: '2025-01-03', navMicros: 10_000000, source: 'order' },
    ]

    const series = dailySeries(funds, orders, prices, '2025-01-03')
    expect(series).toHaveLength(3)
    expect(series[series.length - 1]!.twrIndex).toBeCloseTo(1, 6)
  })

  it('moves TWR when the NAV moves with no new flow', () => {
    const funds: FundRow[] = [
      { isin: 'A', name: 'A', shortName: null, ftXid: null, resolvedAt: null, targetBps: 0, sortOrder: 0, createdAt: '' },
    ]
    const orders: OrderRow[] = [
      { id: '1', brokerOperationId: '1', isin: 'A', kind: 'buy', tradedOn: '2025-01-01', settledOn: '2025-01-01', shareUnits: 1_00000000, navMicros: 10_000000, amountCents: 1_000, createdAt: '' },
    ]
    const prices: PriceRow[] = [
      { isin: 'A', pricedOn: '2025-01-01', navMicros: 10_000000, source: 'order' },
      { isin: 'A', pricedOn: '2025-01-02', navMicros: 11_000000, source: 'order' }, // +10%
    ]

    const series = dailySeries(funds, orders, prices, '2025-01-02')
    expect(series[series.length - 1]!.twrIndex).toBeCloseTo(1.1, 6)
  })
})

describe('parseFtHistory and resolveFund', () => {
  it('reads the close price and date out of a history row', () => {
    const html =
      '<tr><td class="mod-ui-table__cell--text"><span class="mod-ui-hide-small-below">Wednesday, September 09, 2026</span>' +
      '<span class="mod-ui-hide-medium-above">Wed, Sep 09, 2026</span></td>' +
      '<td>14.05</td><td>14.05</td><td>14.05</td><td>14.05</td>' +
      '<td><span class="mod-ui-hide-small-below">0</span><span class="mod-ui-hide-medium-above">0.00</span></td></tr>'

    const points = parseFtHistory(html)
    expect(points).toEqual([{ pricedOn: '2026-09-09', navMicros: 14_050_000 }])
  })

  it('strips thousands separators from the close price', () => {
    const html =
      '<tr><td class="mod-ui-table__cell--text"><span class="mod-ui-hide-small-below">x</span>' +
      '<span class="mod-ui-hide-medium-above">Wed, Sep 09, 2026</span></td>' +
      '<td>44,553.46</td><td>44,553.46</td><td>44,553.46</td><td>44,553.46</td>' +
      '<td><span class="mod-ui-hide-small-below">0</span></td></tr>'

    expect(parseFtHistory(html)).toEqual([{ pricedOn: '2026-09-09', navMicros: 44_553_460_000 }])
  })

  it('resolves a fund name and xid from the tearsheet', async () => {
    const html =
      '<h1 class="mod-tearsheet-overview__header__name mod-tearsheet-overview__header__name--large">Fidelity S&amp;P 500 Index Fund</h1>' +
      '"xid":"667898544"'.replace(/"/g, '&quot;')

    const fetchFn = vi.fn(async () => new Response(html, { status: 200 }))
    const resolved = await resolveFund('IE00BYX5MX67', fetchFn)
    expect(resolved).toEqual({ name: 'Fidelity S&P 500 Index Fund', xid: '667898544' })
  })

  it('returns null rather than throwing when neither the tearsheet nor search match', async () => {
    const fetchFn = vi.fn(async () => new Response('<html></html>', { status: 200 }))
    expect(await resolveFund('LU1623762843', fetchFn)).toBeNull()
  })

  it('falls back to cross-asset-class search for an ETF the fund tearsheet has no page for', async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/data/funds/tearsheet/')) return new Response('<html></html>', { status: 200 })
      return new Response(
        JSON.stringify({
          data: {
            security: [
              { xid: '564800441', name: 'WisdomTree Physical Bitcoin', symbol: 'BTCW:SWX:USD' },
              { xid: '574793005', name: 'WisdomTree Physical Bitcoin', symbol: 'BTCW:SWX:EUR' },
            ],
          },
        }),
        { status: 200 },
      )
    })

    const resolved = await resolveFund('GB00BJYDH287', fetchFn)
    // Prefers the EUR-denominated line over the first result.
    expect(resolved).toEqual({ name: 'WisdomTree Physical Bitcoin', xid: '574793005' })
  })

  it('fetchFtHistory returns an empty array on a non-OK response', async () => {
    const fetchFn = vi.fn(async () => new Response('', { status: 500 }))
    expect(await fetchFtHistory('123', '2025/01/01', '2025/01/02', fetchFn)).toEqual([])
  })
})

async function addFund(isin: string, targetBps = 0) {
  await db
    .prepare('INSERT INTO funds (isin, name, targetBps) VALUES (?, ?, ?)')
    .bind(isin, isin, targetBps)
    .run()
}

async function addOrder(
  isin: string,
  kind: 'buy' | 'sell' | 'transferIn' | 'transferOut',
  tradedOn: string,
  shareUnits: number,
  navMicros: number,
  amountCents: number,
) {
  await db
    .prepare(
      `INSERT INTO investmentOrders
         (id, brokerOperationId, isin, kind, tradedOn, settledOn, shareUnits, navMicros, amountCents)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(newId(), newId(), isin, kind, tradedOn, tradedOn, shareUnits, navMicros, amountCents)
    .run()
}

async function addPrice(isin: string, pricedOn: string, navMicros: number) {
  await db
    .prepare('INSERT INTO fundPrices (isin, pricedOn, navMicros, source) VALUES (?, ?, ?, ?)')
    .bind(isin, pricedOn, navMicros, 'ft')
    .run()
}

describe('syncFundPrices', () => {
  it('is throttled: a second call within the window fetches nothing', async () => {
    await addFund('IE00BYX5NX33')
    await db.prepare('UPDATE funds SET ftXid = ? WHERE isin = ?').bind('667887206', 'IE00BYX5NX33').run()
    await addOrder('IE00BYX5NX33', 'buy', '2025-01-01', 1_00000000, 10_000000, 1_000)

    const historyJson = JSON.stringify({
      html:
        '<tr><td class="mod-ui-table__cell--text"><span class="mod-ui-hide-small-below">x</span>' +
        '<span class="mod-ui-hide-medium-above">Wed, Jan 01, 2025</span></td>' +
        '<td>10.00</td><td>10.00</td><td>10.00</td><td>10.00</td>' +
        '<td><span class="mod-ui-hide-small-below">0</span></td></tr>',
    })
    const fetchFn = vi.fn(async () => new Response(historyJson, { status: 200 }))

    const first = await syncFundPrices(db, fetchFn)
    expect(first).toBeGreaterThan(0)
    expect(fetchFn).toHaveBeenCalledTimes(1)

    const second = await syncFundPrices(db, fetchFn)
    expect(second).toBe(0)
    expect(fetchFn).toHaveBeenCalledTimes(1) // no new subrequest — the throttle short-circuited
  })

  it('force bypasses the throttle', async () => {
    await addFund('IE00BYX5NX33')
    await db.prepare('UPDATE funds SET ftXid = ? WHERE isin = ?').bind('667887206', 'IE00BYX5NX33').run()
    await addOrder('IE00BYX5NX33', 'buy', '2025-01-01', 1_00000000, 10_000000, 1_000)

    const historyJson = JSON.stringify({ html: '' })
    const fetchFn = vi.fn(async () => new Response(historyJson, { status: 200 }))

    await syncFundPrices(db, fetchFn)
    await syncFundPrices(db, fetchFn, { force: true })
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('keeps last-known prices when the fetch throws', async () => {
    await addFund('IE00BYX5NX33')
    await db.prepare('UPDATE funds SET ftXid = ? WHERE isin = ?').bind('667887206', 'IE00BYX5NX33').run()
    await addOrder('IE00BYX5NX33', 'buy', '2025-01-01', 1_00000000, 10_000000, 1_000)
    await addPrice('IE00BYX5NX33', '2025-01-01', 10_000000)

    const fetchFn = vi.fn(async () => {
      throw new Error('network down')
    })

    await expect(syncFundPrices(db, fetchFn, { force: true })).resolves.toBe(0)

    const price = await db
      .prepare('SELECT navMicros FROM fundPrices WHERE isin = ?')
      .bind('IE00BYX5NX33')
      .first<{ navMicros: number }>()
    expect(price?.navMicros).toBe(10_000000)
  })
})
