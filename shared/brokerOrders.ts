import type { BrokerOrderInput, OrderKind } from './schemas.ts'

/**
 * MyInvestor's order-history export. Column order is fixed by the export
 * layout, not derived from its header — the header spans two nested rows
 * ("Fechas" grouping "Operación"/"Liquidación" as sub-columns, and
 * "Operación" reused for the operation-type column) that don't map cleanly
 * onto a flat cell list, so callers pick data rows out by shape instead (see
 * `src/features/investments/parseOrdersXls.ts`) and this reads them by fixed
 * position: trade date, settlement date, the broker's own operation id,
 * market, operation type, ISIN, fund name, shares, currency, net NAV, net
 * amount.
 */
const COLUMNS = {
  tradedOn: 0,
  settledOn: 1,
  operationId: 2,
  market: 3,
  operationType: 4,
  isin: 5,
  fundName: 6,
  shares: 7,
  currency: 8,
  nav: 9,
  amount: 10,
} as const

const EXPECTED_COLUMNS = 11

/** Every operation type MyInvestor's export has been observed to emit.
 *  Traspasos (internal fund-to-fund moves) and switches map to the transfer
 *  kinds, never to buy/sell — they carry no new external cash. COMPRA/VENTA
 *  are the exchange-traded side (ETFs/ETPs bought directly on a market like
 *  XETRA) rather than a fund subscription, but they're still an external buy
 *  or sell. An operation type not in this table is rejected rather than
 *  guessed at: a new export format should fail loudly, not silently post as
 *  a contribution. */
const OPERATION_KIND: Record<string, OrderKind> = {
  SUSCRIPCION: 'buy',
  REEMBOLSO: 'sell',
  COMPRA: 'buy',
  VENTA: 'sell',
  'SUSCR.POR TRASPASO I': 'transferIn',
  'REEMB.POR TRASPASO I': 'transferOut',
  'ALTA IIC SWITCH': 'transferIn',
  'BAJA IIC SWITCH': 'transferOut',
}

export const KNOWN_OPERATION_TYPES = Object.keys(OPERATION_KIND)

export class BrokerOrderParseError extends Error {}

/**
 * Parses a decimal string into an exact scaled integer without going through
 * a float — `Number('558.82000350') * 1e8` drifts in the last digit or two,
 * and a position that should close to exactly zero shares would not.
 */
export function parseScaledDecimal(raw: string, scale: number): number {
  const trimmed = raw.trim()
  const negative = trimmed.startsWith('-')
  const unsigned = negative ? trimmed.slice(1) : trimmed
  const [intPart = '0', fracPart = ''] = unsigned.split('.')
  const fraction = `${fracPart}${'0'.repeat(scale)}`.slice(0, scale)
  const digits = `${intPart}${fraction}`.replace(/^0+(?=\d)/, '')
  const value = Number(digits)
  if (!Number.isFinite(value)) {
    throw new BrokerOrderParseError(`Not a number: "${raw}"`)
  }
  return negative ? -value : value
}

/** Maps one already-tabular order row (11 cells, MyInvestor's column order)
 *  to an import-ready order. `rowNumber` is 1-based, for error messages only. */
export function mapBrokerRow(cells: string[], rowNumber: number): BrokerOrderInput {
  if (cells.length !== EXPECTED_COLUMNS) {
    throw new BrokerOrderParseError(
      `Row ${rowNumber}: expected ${EXPECTED_COLUMNS} columns, found ${cells.length}`,
    )
  }

  const operationType = cells[COLUMNS.operationType]!.trim()
  const kind = OPERATION_KIND[operationType]
  if (!kind) {
    throw new BrokerOrderParseError(
      `Row ${rowNumber}: unrecognised operation type "${operationType}"`,
    )
  }

  const isin = cells[COLUMNS.isin]!.trim().toUpperCase()
  if (!/^[A-Z0-9]{12}$/.test(isin)) {
    throw new BrokerOrderParseError(`Row ${rowNumber}: "${isin}" doesn't look like an ISIN`)
  }

  // An order this app tracks always has a non-zero share count, NAV and
  // amount — a blank or unparsable cell here (a cancelled order slipping
  // through, say) should fail loudly and name the row, not silently become a
  // zero that the schema rejects for the whole batch with no context.
  for (const [label, index] of [
    ['shares', COLUMNS.shares],
    ['NAV', COLUMNS.nav],
    ['amount', COLUMNS.amount],
  ] as const) {
    if (!/\d/.test(cells[index]!)) {
      throw new BrokerOrderParseError(`Row ${rowNumber}: missing or unreadable ${label}`)
    }
  }

  return {
    brokerOperationId: cells[COLUMNS.operationId]!.trim(),
    isin,
    fundName: cells[COLUMNS.fundName]!.trim(),
    kind,
    tradedOn: cells[COLUMNS.tradedOn]!.trim(),
    settledOn: cells[COLUMNS.settledOn]!.trim(),
    shareUnits: parseScaledDecimal(cells[COLUMNS.shares]!, 8),
    navMicros: parseScaledDecimal(cells[COLUMNS.nav]!, 6),
    amountCents: parseScaledDecimal(cells[COLUMNS.amount]!, 2),
  }
}

export function mapBrokerRows(rows: string[][]): BrokerOrderInput[] {
  return rows.map((cells, index) => mapBrokerRow(cells, index + 1))
}
