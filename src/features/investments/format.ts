/** A fund's short name where one has been set, else its full FT/broker name —
 *  the one label every investments surface reads a fund by. */
export function fundLabel(fund: { name: string; shortName: string | null }): string {
  return fund.shortName ?? fund.name
}

export function bpsToPercent(bps: number): number {
  return bps / 100
}

export function percentToBps(percent: number): number {
  return Math.round(percent * 100)
}

/** `+12.3%` / `−4.5%`, one decimal — the same shape used for gain/TWR figures
 *  across the investments screen. */
export function formatSignedPercent(value: number): string {
  const rounded = value.toFixed(1)
  return value > 0 ? `+${rounded}%` : `${rounded}%`
}
