import { describe, expect, it } from 'vitest'
import { planFromToday, planValueAtDate, realToNominal } from '../../../../engine'
import { makeScenario } from '../../../../testing/factories'
import {
  buildRows,
  calendarYear,
  cellText,
  describeCell,
  gapIsSooner,
  gapLabel,
  gapShort,
  gapVersus,
  goalsPerPage,
  longestHorizon,
  moveCell,
  pageLabel,
  reachedByEveryRow,
  rowHasGaps,
  soonestFirst,
  splitPages,
  tintPercent,
  yearsBetween,
  cellFromOffset,
  type MilestoneRow,
} from './milestoneModel'

/** A row that starts today unless it says otherwise, so its cells are the same counted either way. */
function row(overrides: Partial<MilestoneRow>): MilestoneRow {
  const cells = overrides.cells ?? [6]
  return {
    id: 'r',
    kind: 'saved',
    name: 'Path B',
    color: '#10b981',
    horizonYears: 30,
    startDate: '2026-01-01',
    elapsedYears: 0,
    horizonFromNow: overrides.horizonYears ?? 30,
    sinceStart: cells,
    offsets: cells,
    cells,
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

  it('counts each horizon from today, so a path that started long ago ends sooner', () => {
    const old = row({ horizonYears: 45, horizonFromNow: 42 })
    expect(longestHorizon([row({ horizonYears: 30 }), old])).toBe(42)
  })
})

describe('yearsBetween', () => {
  it('counts whole years on an anniversary and the part of a year in between', () => {
    expect(yearsBetween('2024-10-04', '2026-10-04')).toBe(2)
    expect(yearsBetween('2025-10-04', '2026-10-04')).toBe(1)
    expect(yearsBetween('2026-10-04', '2026-10-04')).toBe(0)
    expect(yearsBetween('2024-10-04', '2026-04-04')).toBeCloseTo(1.5, 1)
    expect(yearsBetween('2026-01-01', '2026-10-04')).toBeCloseTo(0.76, 2)
  })

  it('is negative when the start is still ahead', () => {
    expect(yearsBetween('2027-10-04', '2026-10-04')).toBe(-1)
    expect(yearsBetween('2026-12-01', '2026-10-04')).toBeLessThan(0)
  })

  it('does not drift across a leap day', () => {
    expect(yearsBetween('2020-02-29', '2024-02-29')).toBe(4)
    expect(yearsBetween('2023-03-01', '2024-03-01')).toBe(1)
  })
})

describe('cellFromOffset', () => {
  it("is the path's own figure, rounded up, for a path that started today", () => {
    expect(cellFromOffset(6, 0)).toBe(6)
    expect(cellFromOffset(5.2, 0)).toBe(6)
    expect(cellFromOffset(0.4, 0)).toBe(1)
  })

  it('takes the years the path has run off the day it reaches the amount, and rounds up once', () => {
    expect(cellFromOffset(6, 3.2)).toBe(3)
    expect(cellFromOffset(6, 3)).toBe(3)
    expect(cellFromOffset(5.4, 3.2)).toBe(3)
    expect(cellFromOffset(5.4, 2.99)).toBe(3)
    // The old two roundings made these 10 and 3 for a path 0,548 years in that reaches it 9,401 years from its start.
    expect(cellFromOffset(9.401, 0.548)).toBe(9)
    expect(cellFromOffset(8.85, 0)).toBe(9)
  })

  it('adds the wait for a path that starts later', () => {
    expect(cellFromOffset(3, -0.5)).toBe(4)
    expect(cellFromOffset(3, -2)).toBe(5)
  })

  it('keeps already there as 0, and a path that reached it before today is there too', () => {
    expect(cellFromOffset(0, 3.2)).toBe(0)
    expect(cellFromOffset(0, -1.5)).toBe(0)
    expect(cellFromOffset(3, 3.2)).toBe(0)
    expect(cellFromOffset(3, 3)).toBe(0)
    expect(cellFromOffset(3, 40)).toBe(0)
  })

  it('keeps not within the horizon as null', () => {
    expect(cellFromOffset(null, 3.2)).toBeNull()
  })
})

describe('a path exactly on the plan, restarted from today', () => {
  // The plan restarted on its own line changes nothing (GOALS-MODEL), so its cells are the plan's, whatever day it is.
  const inflation = 0.02
  const milestones = [100_000, 250_000, 500_000, 1_000_000].map((e) => ({ amountCents: e * 100, label: '' }))
  const plan = makeScenario({ id: 1, name: 'Path A', isActive: true, planStartDate: '2026-01-01', housePurchaseYear: null })
  const checkinsOnTheLine = ['2026-07-20', '2027-03-05', '2028-10-15', '2030-05-31', '2033-01-02', '2036-09-09']

  it.each(checkinsOnTheLine)('gives the plan and its restart the same years on %s', (date) => {
    const onLine = realToNominal(planValueAtDate(plan, date, inflation)!, '2026-01-01', date, inflation)
    const restarted = planFromToday(plan, { investedCents: onLine, date }, inflation)
    expect(restarted).not.toBeNull()
    const [planRow, todayRow] = buildRows([plan], makeScenario({ id: 0 }), milestones, inflation, false, restarted, date)
    expect(todayRow!.kind).toBe('fromToday')
    expect(todayRow!.cells).toEqual(planRow!.cells)
  })

  it.each(checkinsOnTheLine)('is never more than a year later than the day the plan reaches it, counted from %s', (date) => {
    const [planRow] = buildRows([plan], makeScenario({ id: 0 }), milestones, inflation, false, null, date)
    planRow!.offsets.forEach((offset, i) => {
      const cell = planRow!.cells[i]
      if (offset === null || cell === null || cell === undefined) return
      const exact = Math.max(0, offset - planRow!.elapsedYears)
      expect(cell).toBeGreaterThanOrEqual(exact - 1e-9)
      expect(cell - exact).toBeLessThan(1 + 1e-9)
    })
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

  it('has nothing for the plan itself, or with no plan to compare with', () => {
    expect(gapVersus(plan, plan, 0)).toBeNull()
    expect(gapVersus(row({}), null, 0)).toBeNull()
  })

  it('gives a figure whatever day each path started on, from the years shown for both', () => {
    const early = row({ id: 'p', kind: 'plan', startDate: '2024-04-01', elapsedYears: 2.5, sinceStart: [6], cells: [4] })
    const late = row({ startDate: '2026-06-01', elapsedYears: 0.3, sinceStart: [7], cells: [7] })
    expect(gapVersus(late, early, 0)).toEqual({ kind: 'years', years: 3 })
    expect(gapVersus({ ...late, cells: [2], startDate: '2021-01-01', elapsedYears: 5.5 }, early, 0)).toEqual({
      kind: 'years',
      years: -2,
    })
  })

  it('sets the plan from today against the plan too, on the same footing', () => {
    expect(gapVersus(row({ kind: 'fromToday', cells: [5], startDate: '2026-05-01' }), plan, 0)).toEqual({
      kind: 'years',
      years: 2,
    })
  })

  it('reads a path that is already there against one that is not as the years to go', () => {
    expect(gapVersus(row({ cells: [0] }), plan, 0)).toEqual({ kind: 'years', years: -3 })
    expect(gapVersus(row({ cells: [0] }), { ...plan, cells: [0] }, 0)).toEqual({ kind: 'same' })
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

  it("says the years from today, and the calendar year of the path's own step", () => {
    const old = row({ cells: [3], sinceStart: [5], startDate: '2024-05-01', elapsedYears: 2.4 })
    expect(describeCell({ ...base, row: old })).toBe('Path B reaches 750k € in 3 years, by 2029.')
  })

  it('says a path already has it, or does not get there within its horizon', () => {
    expect(describeCell({ ...base, row: row({ cells: [0] }) })).toBe('Path B already has 750k € at its start.')
    expect(describeCell({ ...base, row: row({ cells: [null], horizonYears: 25 }) })).toBe(
      'Path B does not reach 750k € within its horizon (the next 25 years).',
    )
  })

  it('counts the end of the horizon from today for a path that started a while ago', () => {
    const old = row({ cells: [null], horizonYears: 30, horizonFromNow: 27, elapsedYears: 3.2 })
    expect(describeCell({ ...base, row: old })).toBe('Path B does not reach 750k € within its horizon (the next 27 years).')
  })

  it('says a path reached it before today, and in what year, when its own step is already behind', () => {
    const old = row({ cells: [0], sinceStart: [3], startDate: '2022-05-01', elapsedYears: 4.4 })
    expect(describeCell({ ...base, row: old })).toBe('Path B reached 750k € before today, in 2025.')
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
      planFromToday(plan, { investedCents: 1, date: '2026-01-01' }, 0.02),
      '2026-10-03',
    )

    expect(rows.map((r) => [r.id, r.kind, r.startDate])).toEqual([
      ['1', 'plan', '2024-01-01'],
      ['from-today', 'fromToday', '2026-01-01'],
    ])
  })

  it('counts each cell from today: the years since the start less the years the path has already run', () => {
    const old = makeScenario({ id: 1, planStartDate: '2023-07-01', startInvestedCents: 1_000_000, monthlyContributionCents: 50_000 })
    const fresh = makeScenario({ id: 2, planStartDate: '2026-10-03', startInvestedCents: 1_000_000, monthlyContributionCents: 50_000 })
    const [first, second] = buildRows([old, fresh], draft, milestones, 0, false, null, '2026-10-04')
    const fromNow = (r: MilestoneRow | undefined) => [Math.ceil(r!.offsets[0]! - r!.elapsedYears)]

    expect(first!.elapsedYears).toBeCloseTo(3.26, 2)
    expect(first!.offsets[0]!).toBeGreaterThan(4)
    // Rounded up once, from the day the path reaches the amount: not up to a yearly step from its start first.
    expect(first!.cells).toEqual(fromNow(first))
    // Started yesterday: nothing has run, so the figure is the path's own.
    expect(second!.sinceStart).toEqual([Math.ceil(second!.offsets[0]!)])
    expect(second!.cells).toEqual(fromNow(second))
  })

  it('counts the end of the horizon from today, at least a year', () => {
    const old = makeScenario({ id: 1, planStartDate: '2023-07-01', horizonYears: 30 })
    const gone = makeScenario({ id: 2, planStartDate: '1990-01-01', horizonYears: 30 })
    const rows = buildRows([old, gone], draft, milestones, 0, false, null, '2026-10-04')

    expect(rows.map((r) => r.horizonFromNow)).toEqual([27, 1])
    expect(rows.map((r) => r.horizonYears)).toEqual([30, 30])
  })

  it('shows a milestone the path passed before today as already there, keeping its own step for the calendar year', () => {
    const old = makeScenario({ id: 1, planStartDate: '2015-01-01', startInvestedCents: 1_000_000, monthlyContributionCents: 100_000 })
    const [row] = buildRows([old], draft, milestones, 0, false, null, '2026-10-04')

    expect(row?.sinceStart[0]).toBeGreaterThan(0)
    expect(row?.sinceStart[0]).toBeLessThanOrEqual(11)
    expect(row?.cells).toEqual([0])
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

describe('goalsPerPage', () => {
  it('fits what the width holds once the names have their share, at least two', () => {
    expect(goalsPerPage(272)).toBe(3) // a 320px phone
    expect(goalsPerPage(327)).toBe(4) // 375px
    expect(goalsPerPage(382)).toBe(5) // 430px
    expect(goalsPerPage(700)).toBe(9) // a tablet in portrait
    expect(goalsPerPage(120)).toBe(2)
    expect(goalsPerPage(0)).toBe(2)
  })
})

describe('splitPages', () => {
  const upTo = (n: number) => Array.from({ length: n }, (_, i) => i)

  it('keeps everything on one page when it fits', () => {
    expect(splitPages(upTo(3), 4)).toEqual([[0, 1, 2]])
    expect(splitPages(upTo(4), 4)).toEqual([[0, 1, 2, 3]])
  })

  it('splits as evenly as it can, so no page is left with one column', () => {
    expect(splitPages(upTo(5), 4)).toEqual([[0, 1, 2], [3, 4]])
    expect(splitPages(upTo(8), 4)).toEqual([[0, 1, 2, 3], [4, 5, 6, 7]])
    expect(splitPages(upTo(9), 4)).toEqual([[0, 1, 2], [3, 4, 5], [6, 7, 8]])
    expect(splitPages(upTo(7), 3)).toEqual([[0, 1, 2], [3, 4], [5, 6]])
    expect(splitPages(upTo(10), 4)).toEqual([[0, 1, 2, 3], [4, 5, 6], [7, 8, 9]])
    expect(splitPages(upTo(12), 3)).toEqual([[0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11]])
  })

  it('keeps the indices it was given, not their position', () => {
    expect(splitPages([1, 2, 3, 4, 5], 3)).toEqual([[1, 2, 3], [4, 5]])
  })

  it('is no pages for no milestones, and one column a page at the very least', () => {
    expect(splitPages([], 4)).toEqual([])
    expect(splitPages(upTo(2), 0)).toEqual([[0], [1]])
  })
})

describe('reachedByEveryRow', () => {
  const rowsOf = (...cells: (number | null)[][]) => cells.map((c, i) => row({ id: `r${i}`, cells: c }))

  it('lists the milestones every row has a tick in', () => {
    expect(reachedByEveryRow(rowsOf([0, 0, 4], [0, 2, 9]), 3)).toEqual([0])
    expect(reachedByEveryRow(rowsOf([0, 0, 4], [0, 0, 9]), 3)).toEqual([0, 1])
  })

  it('leaves a milestone one row has not reached', () => {
    expect(reachedByEveryRow(rowsOf([0, 3], [2, 3]), 2)).toEqual([])
  })

  it('does not fold a milestone a path never gets to', () => {
    expect(reachedByEveryRow(rowsOf([0, 5], [0, null]), 2)).toEqual([0])
  })

  it('folds nothing when that would be every milestone, or when there are no rows', () => {
    expect(reachedByEveryRow(rowsOf([0, 0], [0, 0]), 2)).toEqual([])
    expect(reachedByEveryRow([], 3)).toEqual([])
  })
})

describe('soonestFirst', () => {
  it('orders by the years to the milestone, the ones that never get there last', () => {
    const rows = [
      row({ id: 'a', cells: [null] }),
      row({ id: 'b', cells: [7] }),
      row({ id: 'c', cells: [0] }),
      row({ id: 'd', cells: [3] }),
    ]
    expect(soonestFirst(rows, 0).map((r) => r.id)).toEqual(['c', 'd', 'b', 'a'])
  })

  it('keeps the table order for rows that tie, and does not change the rows it was given', () => {
    const rows = [row({ id: 'a', cells: [4] }), row({ id: 'b', cells: [4] }), row({ id: 'c', cells: [null] }), row({ id: 'd', cells: [null] })]
    expect(soonestFirst(rows, 0).map((r) => r.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('pageLabel', () => {
  it('names a page by its first and last milestone', () => {
    expect(pageLabel('150k', '400k')).toBe('150k–400k')
  })

  it('is the one name for a page of one', () => {
    expect(pageLabel('2M', '2M')).toBe('2M')
  })
})

describe('cellText', () => {
  it('reads years, the calendar year, a tick, and the end of the horizon with a plus', () => {
    const r = row({ cells: [0, 6, null], sinceStart: [0, 6, null], horizonYears: 30, horizonFromNow: 30 })
    expect(cellText(r, 0, 'years')).toBe('✓')
    expect(cellText(r, 1, 'years')).toBe('6y')
    expect(cellText(r, 1, 'calendar')).toBe('2032')
    expect(cellText(r, 2, 'years')).toBe('30+')
    expect(cellText(r, 2, 'calendar')).toBe('2056+')
  })
})

describe('gapLabel and rowHasGaps', () => {
  it('says the gap against the plan, and nothing where both have a tick', () => {
    const p = row({ id: 'p', kind: 'plan', cells: [0, 3, 3] })
    const r = row({ cells: [0, 6, 2] })
    expect(gapLabel(r, p, 0)).toBeNull()
    expect(gapLabel(r, p, 1)).toEqual({ text: '+3y', sooner: false })
    expect(gapLabel(r, p, 2)).toEqual({ text: '−1y', sooner: true })
    expect(gapLabel(r, null, 1)).toBeNull()
  })

  it('gives a row its line when any milestone has something in it, whichever page is in view', () => {
    const p = row({ id: 'p', kind: 'plan', cells: [0, 3, 3] })
    expect(rowHasGaps(row({ cells: [0, 3, 3] }), p)).toBe(true)
    expect(rowHasGaps(row({ cells: [0, 0, 0] }), row({ id: 'p', kind: 'plan', cells: [0, 0, 0] }))).toBe(false)
    expect(rowHasGaps(row({ cells: [0, 6, 2] }), null)).toBe(false)
  })
})
