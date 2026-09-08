/*
 * Splits `cells` between `values` in proportion to their share of the total,
 * by largest remainder, so the parts sum to exactly `cells`.
 *
 * Rounding each share independently would not: five accounts at 19.9% each
 * floor to 95 cells and leave a five-cell hole at the end of a strip that is
 * supposed to represent the whole. Two rules are layered on top:
 *  - any non-zero value owes at least one cell, so a small account is visible
 *    rather than rounded out of existence;
 *  - a value at or below zero gets none, because a part-to-whole encoding has
 *    no way to show a negative part.
 */
export function allocateCells(values: number[], cells: number): number[] {
  const total = values.reduce((sum, value) => sum + Math.max(0, value), 0)
  if (total <= 0 || cells <= 0) return values.map(() => 0)

  const exact = values.map((value) => (Math.max(0, value) / total) * cells)
  const out = exact.map((share, index) => (values[index]! > 0 ? Math.max(1, Math.floor(share)) : 0))

  let drift = out.reduce((sum, value) => sum + value, 0) - cells
  const byRemainder = exact
    .map((share, index) => ({ index, remainder: share - Math.floor(share) }))
    .sort((a, b) => b.remainder - a.remainder)

  // Hand the leftovers to the largest remainders.
  for (let step = 0; drift < 0; step++) {
    out[byRemainder[step % byRemainder.length]!.index]! += 1
    drift += 1
  }

  // Overshoot only happens when the minimum-one rule outruns the budget, which
  // needs more accounts than cells. Shave it off the largest shares, in order,
  // and stop once nothing can spare a cell.
  const bySize = exact.map((share, index) => ({ index, share })).sort((a, b) => b.share - a.share)
  while (drift > 0) {
    const spare = bySize.find(({ index }) => out[index]! > 1)
    if (!spare) break
    out[spare.index]! -= 1
    drift -= 1
  }

  return out
}
