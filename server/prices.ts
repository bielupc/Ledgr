import { addDays, format, parseISO } from 'date-fns'
import { nowIso, today, type DB } from './db.ts'

export interface ResolvedFund {
  name: string
  xid: string
}

export interface FtPricePoint {
  pricedOn: string
  navMicros: number
}

type FetchLike = typeof fetch

// FT serves its unofficial tearsheet/history endpoints only to something
// that looks like a browser — no key, no documented contract, so a request
// without this gets refused outright rather than throttled.
const FT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

const RESYNC_THROTTLE_MS = 4 * 60 * 60 * 1000
const RESOLVE_RETRY_MS = 24 * 60 * 60 * 1000
/** How far before a newly-imported fund's first order to start pulling
 *  history, so its price chart doesn't open on the exact day of the order. */
const NEW_FUND_LOOKBACK_DAYS = 7

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&#39;': "'",
  '&quot;': '"',
  '&apos;': "'",
}

function decodeEntities(text: string): string {
  return text.replace(/&amp;|&#39;|&quot;|&apos;/g, (match) => HTML_ENTITIES[match] ?? match)
}

/**
 * FT's fund tearsheet has no public API — this reads the same page a browser
 * renders for the fund's name and its internal `xid`, which the history
 * endpoint below takes instead of the ISIN.
 */
async function resolveFundTearsheet(isin: string, fetchFn: FetchLike): Promise<ResolvedFund | null> {
  const response = await fetchFn(
    `https://markets.ft.com/data/funds/tearsheet/summary?s=${isin}:EUR`,
    { headers: { 'user-agent': FT_USER_AGENT } },
  )
  if (!response.ok) return null
  const html = await response.text()
  const nameMatch = /header__name--large">([^<]+)/.exec(html)
  const xidMatch = /&quot;xid&quot;:&quot;(\d+)/.exec(html)
  if (!nameMatch || !xidMatch) return null
  return { name: decodeEntities(nameMatch[1]!.trim()), xid: xidMatch[1]! }
}

interface FtSearchResult {
  xid: string
  name: string
  symbol: string
  isPrimary?: boolean
}

/**
 * Falls back to FT's cross-asset-class security search — the mutual-fund
 * tearsheet only ever covers, well, mutual funds, and this portfolio can
 * hold exchange-traded instruments (an ETF, say) that FT files under a
 * different section entirely, keyed by ticker rather than ISIN. Search
 * returns candidates across every exchange it's listed on; a EUR-priced line
 * is preferred since this app values everything in EUR, then whichever line
 * FT marks primary, then just the first result.
 */
async function resolveViaSearch(isin: string, fetchFn: FetchLike): Promise<ResolvedFund | null> {
  const response = await fetchFn(
    `https://markets.ft.com/data/searchapi/searchsecurities?query=${isin}`,
    { headers: { 'user-agent': FT_USER_AGENT } },
  )
  if (!response.ok) return null
  const payload = (await response.json().catch(() => null)) as {
    data?: { security?: FtSearchResult[] }
  } | null
  const results = payload?.data?.security ?? []
  if (results.length === 0) return null

  const best =
    results.find((r) => r.symbol.endsWith(':EUR')) ?? results.find((r) => r.isPrimary) ?? results[0]!
  return { name: decodeEntities(best.name), xid: best.xid }
}

/**
 * Two of the twelve funds in this app's own portfolio don't resolve either
 * way (delisted or too obscure for FT's index); those keep pricing from
 * their own orders only.
 */
export async function resolveFund(isin: string, fetchFn: FetchLike): Promise<ResolvedFund | null> {
  return (await resolveFundTearsheet(isin, fetchFn)) ?? (await resolveViaSearch(isin, fetchFn))
}

/**
 * The history endpoint's JSON wraps a table body as one HTML string. Each row
 * carries Open/High/Low/Close, identical for a fund since it prices once a
 * day, so the last of the four numeric cells is read as that day's NAV.
 */
export function parseFtHistory(html: string): FtPricePoint[] {
  const points: FtPricePoint[] = []
  for (const row of html.split('</tr>')) {
    if (!row.includes('<tr>')) continue
    const dateMatch = /hide-medium-above">([^<]+)</.exec(row)
    if (!dateMatch) continue
    const date = new Date(dateMatch[1]!)
    if (Number.isNaN(date.getTime())) continue

    const numbers = [...row.matchAll(/<td>([\d,.]+)<\/td>/g)]
    if (numbers.length === 0) continue
    const close = Number(numbers[numbers.length - 1]![1]!.replace(/,/g, ''))
    if (!Number.isFinite(close) || close <= 0) continue

    points.push({ pricedOn: format(date, 'yyyy-MM-dd'), navMicros: Math.round(close * 1_000_000) })
  }
  return points
}

export async function fetchFtHistory(
  xid: string,
  startDate: string,
  endDate: string,
  fetchFn: FetchLike,
): Promise<FtPricePoint[]> {
  const url = `https://markets.ft.com/data/equities/ajax/get-historical-prices?startDate=${startDate}&endDate=${endDate}&symbol=${xid}`
  const response = await fetchFn(url, { headers: { 'user-agent': FT_USER_AGENT } })
  if (!response.ok) return []
  const payload = (await response.json().catch(() => null)) as { html?: string } | null
  if (!payload?.html) return []
  return parseFtHistory(payload.html)
}

/** `nowIso()` stores `'YYYY-MM-DD HH:MM:SS'` with no zone — always UTC, so
 *  appending `Z` is what makes it parseable again. */
function msSince(isoTimestamp: string): number {
  return Date.now() - Date.parse(`${isoTimestamp.replace(' ', 'T')}Z`)
}

async function dueToSync(db: DB, force: boolean | undefined): Promise<boolean> {
  if (force) return true
  const row = await db
    .prepare("SELECT value FROM meta WHERE key = 'pricesSyncedAt'")
    .first<{ value: string }>()
  return !row || msSince(row.value) >= RESYNC_THROTTLE_MS
}

interface FundRow {
  isin: string
  name: string
  ftXid: string | null
  resolvedAt: string | null
}

/**
 * Brings every fund's price history up to date from FT, falling back to
 * whatever the ledger already has when FT can't resolve or reach a fund.
 * Throttled to once per `RESYNC_THROTTLE_MS` unless `force` — the jobs cron
 * already calls this every 30 minutes, and a fund's NAV is published once a
 * day, so most calls have nothing to do.
 *
 * Sequential per fund rather than batched: each fund's fetch window depends
 * on reading its own latest stored price first, the same reasoning
 * `backfillNetWorthSnapshots` gives for not collecting its reads into one
 * `db.batch()`. At most two subrequests per fund (resolve + history), well
 * under a Worker's per-request subrequest limit even with a dozen funds.
 */
export async function syncFundPrices(
  db: DB,
  fetchFn: FetchLike = fetch,
  opts: { force?: boolean } = {},
): Promise<number> {
  if (!(await dueToSync(db, opts.force))) return 0

  const { results: funds } = await db
    .prepare('SELECT isin, name, ftXid, resolvedAt FROM funds')
    .all<FundRow>()
  const todayStr = today()
  let written = 0

  for (const fund of funds) {
    let xid = fund.ftXid

    if (!xid && (!fund.resolvedAt || msSince(fund.resolvedAt) >= RESOLVE_RETRY_MS)) {
      const resolved = await resolveFund(fund.isin, fetchFn).catch(() => null)
      await db
        .prepare(
          `UPDATE funds SET resolvedAt = ?, ftXid = coalesce(?, ftXid), name = coalesce(?, name)
           WHERE isin = ?`,
        )
        .bind(nowIso(), resolved?.xid ?? null, resolved?.name ?? null, fund.isin)
        .run()
      xid = resolved?.xid ?? null
    }

    if (!xid) continue

    const latestFt = await db
      .prepare("SELECT max(pricedOn) AS d FROM fundPrices WHERE isin = ? AND source = 'ft'")
      .bind(fund.isin)
      .first<{ d: string | null }>()

    let startDate: string
    if (latestFt?.d) {
      startDate = format(addDays(parseISO(latestFt.d), 1), 'yyyy-MM-dd')
      if (startDate > todayStr) continue
    } else {
      const earliest = await db
        .prepare('SELECT min(tradedOn) AS d FROM investmentOrders WHERE isin = ?')
        .bind(fund.isin)
        .first<{ d: string | null }>()
      const anchor = earliest?.d ? parseISO(earliest.d) : parseISO(todayStr)
      startDate = format(addDays(anchor, -NEW_FUND_LOOKBACK_DAYS), 'yyyy-MM-dd')
    }

    const points = await fetchFtHistory(
      xid,
      startDate.replace(/-/g, '/'),
      todayStr.replace(/-/g, '/'),
      fetchFn,
    ).catch(() => [])
    if (points.length === 0) continue

    const ops = points.map((point) =>
      db
        .prepare(
          `INSERT INTO fundPrices (isin, pricedOn, navMicros, source) VALUES (?, ?, ?, 'ft')
           ON CONFLICT (isin, pricedOn) DO UPDATE SET navMicros = excluded.navMicros, source = 'ft'`,
        )
        .bind(fund.isin, point.pricedOn, point.navMicros),
    )
    const results = await db.batch(ops)
    written += results.reduce((sum, result) => sum + (result.meta.changes ?? 0), 0)
  }

  await db
    .prepare(
      `INSERT INTO meta (key, value) VALUES ('pricesSyncedAt', ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    )
    .bind(nowIso())
    .run()

  return written
}
