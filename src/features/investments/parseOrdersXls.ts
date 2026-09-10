import { mapBrokerRows, BrokerOrderParseError } from '@shared/brokerOrders.ts'
import type { BrokerOrderInput } from '@shared/schemas.ts'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * MyInvestor exports its order history as an Excel "HTML table saved as
 * .xls" file, in ISO-8859-1. The header spans two nested rows that don't map
 * cleanly onto a flat cell list, so data rows are picked out by their own
 * shape instead: the first cell is a trade date. The tabular result is
 * handed to `shared/brokerOrders.ts`, which owns the actual column mapping
 * and stays testable without a DOM.
 */
export async function parseOrdersXls(file: File): Promise<BrokerOrderInput[]> {
  const buffer = await file.arrayBuffer()
  const html = new TextDecoder('iso-8859-1').decode(buffer)
  const doc = new DOMParser().parseFromString(html, 'text/html')

  const rows: string[][] = []
  for (const tr of doc.querySelectorAll('tr')) {
    const cells = [...tr.querySelectorAll('td')].map((td) => (td.textContent ?? '').trim())
    if (cells.length > 0 && DATE_PATTERN.test(cells[0]!)) rows.push(cells)
  }

  if (rows.length === 0) {
    throw new BrokerOrderParseError('No order rows found — is this a MyInvestor orders export?')
  }

  return mapBrokerRows(rows)
}
