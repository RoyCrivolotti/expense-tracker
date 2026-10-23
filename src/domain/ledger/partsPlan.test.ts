import { describe, expect, it } from 'vitest'
import { MAX_CUBE_MONTHS, MAX_ROWS_MONTHS, MAX_ROWS_PER_REQUEST } from '../data/ledgerParts'
import { PartTooLargeError } from '../data/ledgerPartsErrors'
import { monthsBetweenBudget, shiftBudgetMonth } from '../engine/dates'
import { planCubeRanges, planCubeRangesOutside, planRowRanges, splitRange } from './partsPlan'

const months = (from: string, count: number): string[] =>
  Array.from({ length: count }, (_, i) => shiftBudgetMonth(from, i))

const perMonth = (list: string[], rows: number): Record<string, number> =>
  Object.fromEntries(list.map((month) => [month, rows]))

describe('planRowRanges', () => {
  it('asks for nothing when there is nothing to hydrate', () => {
    expect(planRowRanges([], {})).toEqual([])
  })

  it('covers a short stretch with one request', () => {
    const list = months('2026-01', 6)
    expect(planRowRanges(list, perMonth(list, 100))).toEqual([{ from: '2026-01', to: '2026-06' }])
  })

  it('breaks a long stretch at the number of months one request may span', () => {
    const list = months('2020-01', 30)
    const ranges = planRowRanges(list, perMonth(list, 10))
    expect(ranges).toEqual([
      { from: '2020-01', to: shiftBudgetMonth('2020-01', MAX_ROWS_MONTHS - 1) },
      { from: shiftBudgetMonth('2020-01', MAX_ROWS_MONTHS), to: '2022-06' },
    ])
    for (const range of ranges) {
      expect(monthsBetweenBudget(range.from, range.to) + 1).toBeLessThanOrEqual(MAX_ROWS_MONTHS)
    }
  })

  it('breaks a stretch at the number of rows one request may return', () => {
    const list = months('2026-01', 4)
    const ranges = planRowRanges(list, perMonth(list, 2_000))
    expect(ranges).toEqual([
      { from: '2026-01', to: '2026-02' },
      { from: '2026-03', to: '2026-04' },
    ])
  })

  it('counts the rows of a month with data that sits inside a range it did not ask for', () => {
    const rows = { '2026-01': 2_000, '2026-02': 2_000, '2026-03': 2_000 }
    expect(planRowRanges(['2026-01', '2026-03'], rows)).toEqual([
      { from: '2026-01', to: '2026-01' },
      { from: '2026-03', to: '2026-03' },
    ])
  })

  it('does not count the empty months of a gap, so a gap does not split a range', () => {
    const rows = { '2026-01': 10, '2026-06': 10 }
    expect(planRowRanges(['2026-01', '2026-06'], rows)).toEqual([{ from: '2026-01', to: '2026-06' }])
  })

  it('refuses a month that is too big for any request', () => {
    expect(() => planRowRanges(['2026-01'], { '2026-01': MAX_ROWS_PER_REQUEST + 1 })).toThrow(PartTooLargeError)
  })
})

describe('planCubeRanges', () => {
  it('asks for nothing when no month has data', () => {
    expect(planCubeRanges([])).toEqual([])
  })

  it('covers the first month to the last with one request when it is short enough', () => {
    expect(planCubeRanges(['2026-03', '2026-01', '2026-09'])).toEqual([{ from: '2026-01', to: '2026-09' }])
  })

  it('breaks the span in chunks of the longest range the route serves', () => {
    const last = shiftBudgetMonth('2015-01', 2 * MAX_CUBE_MONTHS + 4)
    const ranges = planCubeRanges(['2015-01', last])
    expect(ranges).toHaveLength(3)
    expect(ranges[0]).toEqual({ from: '2015-01', to: shiftBudgetMonth('2015-01', MAX_CUBE_MONTHS - 1) })
    expect(ranges[2]).toEqual({ from: shiftBudgetMonth('2015-01', 2 * MAX_CUBE_MONTHS), to: last })
    expect(ranges.map((range) => range.from)).toEqual(
      [0, 1, 2].map((i) => shiftBudgetMonth('2015-01', i * MAX_CUBE_MONTHS)),
    )
  })
})

describe('planCubeRangesOutside', () => {
  const months = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']
  const covering = (...list: string[]) => new Set(list)

  it('is planCubeRanges when no month is covered', () => {
    expect(planCubeRangesOutside(months, covering())).toEqual(planCubeRanges(months))
  })

  it('asks for nothing when every month is covered, or none has data', () => {
    expect(planCubeRangesOutside(months, covering(...months))).toEqual([])
    expect(planCubeRangesOutside([], covering())).toEqual([])
  })

  it('stops short of the months at either end that rows cover', () => {
    expect(planCubeRangesOutside(months, covering('2026-05', '2026-06'))).toEqual([{ from: '2026-01', to: '2026-04' }])
    expect(planCubeRangesOutside(months, covering('2026-01', '2026-02'))).toEqual([{ from: '2026-03', to: '2026-06' }])
  })

  it('asks twice when a covered month is between the others, since a request is a calendar range', () => {
    expect(planCubeRangesOutside(months, covering('2026-03', '2026-04'))).toEqual([
      { from: '2026-01', to: '2026-02' },
      { from: '2026-05', to: '2026-06' },
    ])
    expect(planCubeRangesOutside(months, covering('2026-03'))).toEqual([
      { from: '2026-01', to: '2026-02' },
      { from: '2026-04', to: '2026-06' },
    ])
  })

  it('takes a month with no data between two others into the request, and breaks a long run in chunks', () => {
    expect(planCubeRangesOutside(['2026-01', '2026-04'], covering())).toEqual([{ from: '2026-01', to: '2026-04' }])
    const last = shiftBudgetMonth('2015-01', MAX_CUBE_MONTHS + 2)
    expect(planCubeRangesOutside(['2015-01', last, '2030-01'], covering('2030-01'))).toHaveLength(2)
  })
})

describe('splitRange', () => {
  it('halves a range so that every month is in exactly one half', () => {
    expect(splitRange({ from: '2026-01', to: '2026-06' })).toEqual([
      { from: '2026-01', to: '2026-03' },
      { from: '2026-04', to: '2026-06' },
    ])
    expect(splitRange({ from: '2026-01', to: '2026-03' })).toEqual([
      { from: '2026-01', to: '2026-01' },
      { from: '2026-02', to: '2026-03' },
    ])
  })

  it('cannot split a single month', () => {
    expect(splitRange({ from: '2026-04', to: '2026-04' })).toBeNull()
  })
})
