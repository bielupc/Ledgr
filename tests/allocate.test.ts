import { describe, expect, it } from 'vitest'
import { allocateCells } from '../src/lib/allocate'

describe('allocateCells', () => {
  it('sums to exactly the cell budget', () => {
    for (const values of [
      [1990, 1990, 1990, 1990, 1990],
      [1, 1, 1],
      [500000, 12345, 987, 6],
      [7],
    ]) {
      expect(allocateCells(values, 100).reduce((sum, n) => sum + n, 0)).toBe(100)
    }
  })

  it('gives every non-zero value at least one cell', () => {
    // 1 cent against a million would floor to zero cells.
    const out = allocateCells([100_000_000, 1], 100)
    expect(out).toEqual([99, 1])
  })

  it('gives nothing to zero or negative values', () => {
    const out = allocateCells([1000, 0, -500], 100)
    expect(out[1]).toBe(0)
    expect(out[2]).toBe(0)
    expect(out[0]).toBe(100)
  })

  it('is proportional', () => {
    expect(allocateCells([50, 25, 25], 100)).toEqual([50, 25, 25])
    expect(allocateCells([2, 1, 1], 4)).toEqual([2, 1, 1])
  })

  it('holds the budget when there are more values than cells', () => {
    const out = allocateCells(Array.from({ length: 12 }, () => 100), 8)
    expect(out.reduce((sum, n) => sum + n, 0)).toBeLessThanOrEqual(12)
    expect(out.every((n) => n >= 0)).toBe(true)
  })

  it('has no cells to hand out when nothing is held', () => {
    expect(allocateCells([0, 0], 100)).toEqual([0, 0])
    expect(allocateCells([], 100)).toEqual([])
  })
})
