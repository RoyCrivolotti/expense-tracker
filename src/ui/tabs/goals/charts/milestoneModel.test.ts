import { describe, expect, it } from 'vitest'
import { planFromToday } from '../../../../engine'
import { makeScenario } from '../../../../testing/factories'
import {
  buildRows,
  calendarYear,
  describeCell,
  gapIsSooner,
  gapShort,
  gapVersus,
  longestHorizon,
  moveCell,
  tintPercent,
  type MilestoneRow,
} from './milestoneModel'

function row(overrides: Partial<MilestoneRow>): MilestoneRow {
  return {
    id: 'r',
    kind: 'saved',
    name: 'Path B',
    color: '#10b981',
    horizonYears: 30,
    startDate: '2026-01-01',
    cells: [6],
    ...overrides,
  }
}

const plan = row({ id: 'p', kind: 'plan', name: 'Path A', cells: [3] })

describe('tintPercent', () => {
  it('is 5% at the first year and 31% at the longest horizon, deeper in between', () => {
    expect(tintPercent(1, 30)).toBe(6)
    expect(tintPercent(30, 30)).toBe(31)
    expect(tintPercent(15, 30)).toBe(18)
  })

  it('does not go past the scale for a year beyond it', () => {
    expect(tintPercent(60, 30)).toBe(31)
  })

  it('has no tint for already there or for not within the horizon', () => {
    expect(tintPercent(0, 30)).toBeNull()
    expect(tintPercent(null, 30)).toBeNull()
  })

  it('does not divide by a horizon of nothing', () => {
    expect(tintPercent(1, 0)).toBe(31)
  })
})

describe('calendarYear', () => {
  it('counts whole years on from the year the row starts', () => {
    expect(calendarYear(row({ startDate: '2024-11-03' }), 6)).toBe(2030)
    expect(calendarYear(row({ startDate: '2026-01-01' }), 0)).toBe(2026)
  })
})

describe('longestHorizon', () => {
  it('is the longest of the rows, and at least a year', () => {
    expect(longestHorizon([row({ horizonYears: 25 }), row({ horizonYears: 45 })])).toBe(45)
    expect(longestHorizon([])).toBe(1)
  })
})

describe('gapVersus', () => {
  it('is the years later or sooner than the plan', () => {
    expect(gapVersus(row({ cells: [6] }), plan, 0)).toEqual({ kind: 'years', years: 3 })
    expect(gapVersus(row({ cells: [1] }), plan, 0)).toEqual({ kind: 'years', years: -2 })
    expect(gapVersus(row({ cells: [3] }), plan, 0)).toEqual({ kind: 'same' })
  })

  it('says later or sooner in words where one side never gets there', () => {
    expect(gapVersus(row({ cells: [null] }), plan, 0)).toEqual({ kind: 'later' })
    expect(gapVersus(row({ cells: [4] }), { ...plan, cells: [null] }, 0)).toEqual({ kind: 'sooner' })
    expect(gapVersus(row({ cells: [null] }), { ...plan, cells: [null] }, 0)).toEqual({ kind: 'neither' })
  })

  it('has nothing for the plan, for the plan from today, or with no plan to compare with', () => {
    expect(gapVersus(plan, plan, 0)).toBeNull()
    expect(gapVersus(row({ kind: 'fromToday', cells: [2] }), plan, 0)).toBeNull()
    expect(gapVersus(row({}), null, 0)).toBeNull()
  })

  it('has nothing for a path that starts on another day, whose years count from somewhere else', () => {
    expect(gapVersus(row({ startDate: '2026-06-01' }), plan, 0)).toBeNull()
  })

  it('compares the editing row too', () => {
    expect(gapVersus(row({ kind: 'draft', cells: [5] }), plan, 0)).toEqual({ kind: 'years', years: 2 })
  })
})

describe('gapShort and gapIsSooner', () => {
  it('writes sooner with a minus, later with a plus, and the rest as "=" or a word', () => {
    expect(gapShort({ kind: 'years', years: -2 })).toBe('−2y')
    expect(gapShort({ kind: 'years', years: 3 })).toBe('+3y')
    expect(gapShort({ kind: 'same' })).toBe('=')
    expect(gapShort({ kind: 'neither' })).toBe('=')
    expect(gapShort({ kind: 'later' })).toBe('later')
    expect(gapShort({ kind: 'sooner' })).toBe('sooner')
  })

  it('marks only the paths that are ahead', () => {
    expect(gapIsSooner({ kind: 'years', years: -1 })).toBe(true)
    expect(gapIsSooner({ kind: 'sooner' })).toBe(true)
    expect(gapIsSooner({ kind: 'years', years: 1 })).toBe(false)
    expect(gapIsSooner({ kind: 'later' })).toBe(false)
    expect(gapIsSooner({ kind: 'same' })).toBe(false)
  })
})

describe('describeCell', () => {
  const base = { index: 0, amount: '750k €', reachedOn: undefined, plan: null }

  it('says when and by what year a path gets there', () => {
    expect(describeCell({ ...base, row: row({ cells: [6] }) })).toBe('Path B reaches 750k € in 6 years, by 2032.')
    expect(describeCell({ ...base, row: row({ cells: [1] }) })).toBe('Path B reaches 750k € in 1 year, by 2027.')
  })

  it('counts the year from the row\'s own start', () => {
    expect(describeCell({ ...base, row: row({ cells: [2], startDate: '2024-05-01' }) })).toBe(
      'Path B reaches 750k € in 2 years, by 2026.',
    )
  })

  it('says a path already has it, or does not get there within its horizon', () => {
    expect(describeCell({ ...base, row: row({ cells: [0] }) })).toBe('Path B already has 750k € at its start.')
    expect(describeCell({ ...base, row: row({ cells: [null], horizonYears: 25 }) })).toBe(
      'Path B does not reach 750k € within its 25 year horizon.',
    )
  })

  it('sets the path against the plan when asked to', () => {
    const later = describeCell({ ...base, row: row({ cells: [6] }), plan })
    expect(later).toBe('Path B reaches 750k € in 6 years, by 2032. That is 3 years later than Path A (the plan).')
    expect(describeCell({ ...base, row: row({ cells: [2] }), plan })).toContain('That is 1 year sooner than Path A (the plan).')
    expect(describeCell({ ...base, row: row({ cells: [3] }), plan })).toContain('That is the same as Path A (the plan).')
    expect(describeCell({ ...base, row: row({ cells: [null] }), plan })).toContain(
      'That is later than Path A (the plan), which does get there.',
    )
    expect(describeCell({ ...base, row: row({ cells: [3] }), plan: { ...plan, cells: [null] } })).toContain(
      'That is sooner than Path A (the plan), which does not get there.',
    )
    expect(describeCell({ ...base, row: row({ cells: [null] }), plan: { ...plan, cells: [null] } })).toContain(
      'Path A (the plan) does not get there either.',
    )
  })

  it('says nothing about the plan for the plan itself', () => {
    expect(describeCell({ ...base, row: plan, plan })).toBe('Path A reaches 750k € in 3 years, by 2029.')
  })

  it('ends with when the check-ins reached it, in the short form of the month', () => {
    expect(describeCell({ ...base, row: row({ cells: [0] }), reachedOn: '2026-05-14' })).toBe(
      "Path B already has 750k € at its start. Your check-ins reached it by May '26.",
    )
  })
})

describe('moveCell', () => {
  const size = { rows: 3, cols: 4 }

  it('moves one cell with the arrow keys', () => {
    expect(moveCell({ row: 1, col: 1 }, 'ArrowRight', size)).toEqual({ row: 1, col: 2 })
    expect(moveCell({ row: 1, col: 1 }, 'ArrowLeft', size)).toEqual({ row: 1, col: 0 })
    expect(moveCell({ row: 1, col: 1 }, 'ArrowDown', size)).toEqual({ row: 2, col: 1 })
    expect(moveCell({ row: 1, col: 1 }, 'ArrowUp', size)).toEqual({ row: 0, col: 1 })
  })

  it('stops at the edges instead of wrapping', () => {
    expect(moveCell({ row: 0, col: 0 }, 'ArrowLeft', size)).toEqual({ row: 0, col: 0 })
    expect(moveCell({ row: 0, col: 0 }, 'ArrowUp', size)).toEqual({ row: 0, col: 0 })
    expect(moveCell({ row: 2, col: 3 }, 'ArrowRight', size)).toEqual({ row: 2, col: 3 })
    expect(moveCell({ row: 2, col: 3 }, 'ArrowDown', size)).toEqual({ row: 2, col: 3 })
  })

  it('takes Home and End to the first and last cell of the row', () => {
    expect(moveCell({ row: 1, col: 2 }, 'Home', size)).toEqual({ row: 1, col: 0 })
    expect(moveCell({ row: 1, col: 1 }, 'End', size)).toEqual({ row: 1, col: 3 })
  })
})

describe('buildRows', () => {
  const draft = makeScenario({ id: 0, name: 'Scenario', planStartDate: '2025-02-01' })
  const milestones = [{ amountCents: 20_000_000, label: '' }]

  it('marks the active scenario as the plan, the others as saved, and the draft as editing', () => {
    const rows = buildRows(
      [makeScenario({ id: 1, name: 'Path A', isActive: true }), makeScenario({ id: 2, name: 'Path B' })],
      draft,
      milestones,
      0,
      true,
      null,
      '2026-10-03',
    )

    expect(rows.map((r) => [r.id, r.kind, r.name])).toEqual([
      ['1', 'plan', 'Path A'],
      ['2', 'saved', 'Path B'],
      ['draft', 'draft', 'Scenario (editing)'],
    ])
  })

  it('starts a scenario with no date today, and one with a date on it', () => {
    const rows = buildRows(
      [makeScenario({ id: 1, planStartDate: '2024-01-01' }), makeScenario({ id: 2 })],
      draft,
      milestones,
      0,
      true,
      null,
      '2026-10-03',
    )

    expect(rows.map((r) => r.startDate)).toEqual(['2024-01-01', '2026-10-03', '2025-02-01'])
  })

  it('puts the plan from today under the plan, starting on the check-in', () => {
    const plan = makeScenario({ id: 1, name: 'Path A', isActive: true, planStartDate: '2024-01-01' })
    const rows = buildRows(
      [plan],
      draft,
      milestones,
      0,
      false,
      planFromToday(plan, { investedCents: 1, date: '2026-01-01' }),
      '2026-10-03',
    )

    expect(rows.map((r) => [r.id, r.kind, r.startDate])).toEqual([
      ['1', 'plan', '2024-01-01'],
      ['from-today', 'fromToday', '2026-01-01'],
    ])
  })

  it('leaves the draft out when it is a loaded scenario with no edits', () => {
    const rows = buildRows([makeScenario({ id: 1 })], draft, milestones, 0, false, null, '2026-10-03')

    expect(rows.map((r) => r.id)).toEqual(['1'])
  })

  it('reads a cell as the years to the milestone, 0 when the scenario starts above it', () => {
    const rows = buildRows(
      [makeScenario({ id: 1, startInvestedCents: 30_000_000 })],
      draft,
      milestones,
      0,
      false,
      null,
      '2026-10-03',
    )

    expect(rows[0]?.cells).toEqual([0])
  })
})
