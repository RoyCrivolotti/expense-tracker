import { describe, expect, it } from 'vitest'
import type { MilestoneRow } from './milestoneModel'
import {
  axisSpan,
  axisStartYear,
  axisTicks,
  describeBeyond,
  describeCluster,
  describeGutter,
  labelWidth,
  layoutRow,
  placeLabels,
  rangeLabel,
  rowOffset,
} from './timelineModel'

/** A row that starts today unless it says otherwise, so its cells are the same counted either way. */
function row(overrides: Partial<MilestoneRow>): MilestoneRow {
  const cells = overrides.cells ?? []
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
    cells,
    ...overrides,
  }
}

const ms = (...k: number[]) => k.map((n) => ({ amountCents: n * 100_000, label: '' }))
const none = new Map<number, string>()

describe('the axis', () => {
  it("starts in today's year", () => {
    expect(axisStartYear('2026-10-04')).toBe(2026)
    expect(axisStartYear('2027-01-01')).toBe(2027)
  })

  it('starts a path at now, whenever it began', () => {
    expect(rowOffset(row({ elapsedYears: 0 }))).toBe(0)
    expect(rowOffset(row({ elapsedYears: 3.2, startDate: '2023-07-01' }))).toBe(0)
  })

  it('starts a path that begins later at the years until it does', () => {
    expect(rowOffset(row({ elapsedYears: -0.4 }))).toBe(1)
    expect(rowOffset(row({ elapsedYears: -2 }))).toBe(2)
  })

  it('runs as far as the furthest horizon reaches from today', () => {
    const rows = [row({ horizonYears: 30, horizonFromNow: 27 }), row({ horizonYears: 25, horizonFromNow: 25 }), row({ horizonYears: 40, horizonFromNow: 38 })]
    expect(axisSpan(rows)).toBe(38)
    expect(axisSpan([])).toBe(1)
  })

  it('ticks every five years, and at the end when it is not close to the last tick', () => {
    expect(axisTicks(30)).toEqual([0, 5, 10, 15, 20, 25, 30])
    expect(axisTicks(33)).toEqual([0, 5, 10, 15, 20, 25, 30, 33])
    expect(axisTicks(31)).toEqual([0, 5, 10, 15, 20, 25, 30])
  })
})

describe('layoutRow', () => {
  const milestones = ms(1, 2, 3, 4, 5)

  it('places milestones at the year the path reaches them and joins those in the same year', () => {
    const layout = layoutRow(row({ cells: [3, 3, 7, 9, 9] }), milestones, none)

    expect(layout.clusters).toEqual([
      { years: 3, sinceStart: 3, indices: [0, 1] },
      { years: 7, sinceStart: 7, indices: [2] },
      { years: 9, sinceStart: 9, indices: [3, 4] },
    ])
    expect(layout.gutter).toEqual([])
    expect(layout.beyond).toEqual([])
  })

  it('collapses the milestones already there, and those not within the horizon', () => {
    const layout = layoutRow(row({ cells: [0, 0, 6, null, null] }), milestones, none)

    expect(layout.gutter).toEqual([0, 1])
    expect(layout.beyond).toEqual([3, 4])
    expect(layout.clusters.map((c) => c.indices)).toEqual([[2]])
  })

  it('counts a milestone the check-ins reached as already there, whatever the path says', () => {
    const layout = layoutRow(row({ cells: [4, 5, 6, 7, 8] }), milestones, new Map([[100_000, '2026-05-14']]))

    expect(layout.gutter).toEqual([0])
    expect(layout.clusters.map((c) => c.years)).toEqual([5, 6, 7, 8])
  })

  it('places everything where the path reaches it when every milestone is reached, bar those met at the start', () => {
    const all = new Map(milestones.map((m) => [m.amountCents, '2026-05-14'] as const))
    const layout = layoutRow(row({ cells: [0, 4, 5, 7, null] }), milestones, all)

    expect(layout.gutter).toEqual([0])
    expect(layout.clusters.map((c) => c.years)).toEqual([4, 5, 7])
    expect(layout.beyond).toEqual([4])
  })

  it('places the dots of a path that started a while ago by the years from today, with its own step kept for the year', () => {
    const old = row({ cells: [2, 5], sinceStart: [5, 8], startDate: '2023-07-01', elapsedYears: 3.2 })
    const layout = layoutRow(old, ms(1, 2), none)

    expect(layout.clusters).toEqual([
      { years: 2, sinceStart: 5, indices: [0] },
      { years: 5, sinceStart: 8, indices: [1] },
    ])
  })

  it('puts what the path reached before today in the left badge, whatever its own step was', () => {
    const old = row({ cells: [0, 4], sinceStart: [3, 9], startDate: '2020-01-01', elapsedYears: 6.7 })
    const layout = layoutRow(old, ms(1, 2), none)

    expect(layout.gutter).toEqual([0])
    expect(layout.clusters.map((c) => c.years)).toEqual([4])
  })
})

describe('labels', () => {
  it('gives a label the width of its letters and a little more', () => {
    expect(labelWidth('300k')).toBe(4 * 6 + 8)
  })

  it('writes one amount as it is and a run as a range, sharing the unit where it can', () => {
    expect(rangeLabel(['300k'])).toBe('300k')
    expect(rangeLabel(['300k', '400k', '500k'])).toBe('300–500k')
    expect(rangeLabel(['750k', '1,0M'])).toBe('750k–1,0M')
    expect(rangeLabel([])).toBe('')
  })

  it('shows the labels that fit, on the upper level then the lower, and leaves off those that fit neither', () => {
    // 100px between them on a track 300 wide and span 3: each label is 4 letters, 32px.
    const items = [
      { at: 1, text: '100k', pick: false },
      { at: 1.1, text: '200k', pick: false },
      { at: 1.2, text: '300k', pick: false },
      { at: 3, text: '400k', pick: false },
    ]
    expect(placeLabels(items, 3, 300)).toEqual(['up', 'dn', null, 'up'])
  })

  it('always shows the label of the milestone being followed, and keeps the next one clear of it', () => {
    const items = [
      { at: 1, text: '3y', pick: true },
      { at: 1.1, text: '200k', pick: false },
    ]
    expect(placeLabels(items, 3, 300)).toEqual(['up', 'dn'])
  })

  it('fits more labels on a wider track', () => {
    const items = [
      { at: 1, text: '100k', pick: false },
      { at: 1.3, text: '200k', pick: false },
    ]
    expect(placeLabels(items, 3, 300)).toEqual(['up', 'dn'])
    expect(placeLabels(items, 3, 900)).toEqual(['up', 'up'])
  })
})

describe('sentences', () => {
  const r = row({ name: 'Path A', horizonYears: 25 })

  it('counts the calendar year of a dot from the path\'s own step, not from today', () => {
    const old = row({ name: 'Path A', startDate: '2023-07-01', elapsedYears: 3.2 })
    expect(describeCluster(old, { years: 4, sinceStart: 7, indices: [0] }, ['300k €'])).toBe(
      'Path A reaches 300k € in 4 years, by 2030.',
    )
  })

  it('says what a dot for several milestones stands for', () => {
    expect(describeCluster(r, { years: 6, sinceStart: 6, indices: [0, 1] }, ['300k €', '400k €'])).toBe(
      'Path A reaches 300k € and 400k € in 6 years, by 2032.',
    )
    expect(describeCluster(r, { years: 1, sinceStart: 1, indices: [0, 1, 2] }, ['300k €', 'House deposit (400k €)', '500k €'])).toBe(
      'Path A reaches 300k €, House deposit (400k €) and 500k € in 1 year, by 2027.',
    )
  })

  it('says why each milestone in the left badge is already there', () => {
    expect(describeGutter(r, ['100k €', '200k €'], ["reached by May '26", 'met at its start'])).toBe(
      "Path A already has 100k € (reached by May '26) and 200k € (met at its start).",
    )
  })

  it('says which milestones are past the end of the path', () => {
    expect(describeBeyond(r, ['500k €'])).toBe('Path A does not reach 500k € within its horizon (the next 25 years).')
    expect(describeBeyond(r, ['500k €', '750k €'])).toBe(
      'Path A does not reach 500k € and 750k € within its horizon (the next 25 years).',
    )
  })
})
