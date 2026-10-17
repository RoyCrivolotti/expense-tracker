import { describe, expect, it } from 'vitest'
import {
  DEFAULT_HYDRATION_POLICY,
  FULL_HYDRATION_ROW_LIMIT,
  HYDRATED_DATA_MONTHS,
  chooseHydratedMonths,
  hydratedMonthsFor,
} from './hydration'

const run = (first: number, count: number) =>
  Array.from({ length: count }, (_, i) => {
    const index = first + i
    return `${2024 + Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
  })

describe('chooseHydratedMonths', () => {
  const months = run(0, 30)

  it('takes the 13 newest months up to and including the viewed month', () => {
    const chosen = chooseHydratedMonths(months, '2025-12')
    expect(chosen).toHaveLength(HYDRATED_DATA_MONTHS)
    expect(chosen[0]).toBe('2024-12')
    expect(chosen.at(-1)).toBe('2025-12')
  })

  it('counts months with data, so a gap reaches further back in time', () => {
    const gapped = [...run(0, 6), ...run(20, 10)]
    expect(chooseHydratedMonths(gapped, '2025-11', 4)).toEqual(['2024-06', '2025-09', '2025-10', '2025-11'])
  })

  it('ignores months after the viewed month', () => {
    expect(chooseHydratedMonths(months, '2024-03', 5)).toEqual(run(0, 3))
  })

  it('uses the months before a viewed month that has no data', () => {
    const chosen = chooseHydratedMonths(['2025-01', '2025-02', '2025-05'], '2025-04', 2)
    expect(chosen).toEqual(['2025-01', '2025-02'])
  })

  it('takes whatever is there when fewer months exist, and nothing for a count of zero', () => {
    expect(chooseHydratedMonths(['2025-01'], '2025-06')).toEqual(['2025-01'])
    expect(chooseHydratedMonths(months, '2025-06', 0)).toEqual([])
    expect(chooseHydratedMonths([], '2025-06')).toEqual([])
  })

  it('accepts an unsorted list with repeats, as a list of every row\'s month would be', () => {
    expect(chooseHydratedMonths(['2025-03', '2025-01', '2025-03', '2025-02'], '2025-03', 2)).toEqual([
      '2025-02',
      '2025-03',
    ])
  })
})

describe('hydratedMonthsFor', () => {
  const months = run(0, 40)

  it('hydrates every month while the ledger is at or under the row limit', () => {
    expect(hydratedMonthsFor(months, FULL_HYDRATION_ROW_LIMIT, '2025-01')).toEqual(months)
    expect(hydratedMonthsFor(months, 0, '2025-01')).toEqual(months)
  })

  it('hydrates the window ending at the viewed month once it is over', () => {
    const chosen = hydratedMonthsFor(months, FULL_HYDRATION_ROW_LIMIT + 1, '2026-03')
    expect(chosen).toEqual(run(14, 13))
  })

  it('takes the policy as an argument', () => {
    expect(hydratedMonthsFor(months, 10, '2026-03', { fullBelowRows: 5, dataMonths: 2 })).toEqual(run(25, 2))
    expect(DEFAULT_HYDRATION_POLICY).toEqual({ fullBelowRows: FULL_HYDRATION_ROW_LIMIT, dataMonths: 13 })
  })
})
