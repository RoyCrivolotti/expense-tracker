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

function row(overrides: Partial<MilestoneRow>): MilestoneRow {
  return {
    id: 'r',
    kind: 'saved',
    name: 'Path B',
    color: '#10b981',
    horizonYears: 30,
    startDate: '2026-01-01',
    cells: [],
    ...overrides,
  }
}

const ms = (...k: number[]) => k.map((n) => ({ amountCents: n * 100_000, label: '' }))
const none = new Map<number, string>()

describe('the axis', () => {
  it('starts in the year of the plan, or of the first path when none is the plan', () => {
    expect(axisStartYear([row({ startDate: '2025-06-01' }), row({ kind: 'plan', startDate: '2024-02-01' })])).toBe(2024)
    expect(axisStartYear([row({ startDate: '2025-06-01' }), row({ startDate: '2024-02-01' })])).toBe(2025)
  })

  it('shifts a path that starts later by the years between', () => {
    expect(rowOffset(row({ startDate: '2026-03-01' }), 2024)).toBe(2)
    expect(rowOffset(row({ startDate: '2024-03-01' }), 2024)).toBe(0)
  })

  it('does not start a path before the axis does', () => {
    expect(rowOffset(row({ startDate: '2022-03-01' }), 2024)).toBe(0)
  })

  it('runs as far as the furthest horizon reaches, counting where each path starts', () => {
    const rows = [row({ horizonYears: 30, startDate: '2024-01-01' }), row({ horizonYears: 25, startDate: '2026-01-01' }), row({ horizonYears: 40 })]
    expect(axisSpan(rows, 2024)).toBe(Math.max(30, 27, 42))
    expect(axisSpan([], 2024)).toBe(1)
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
    const layout = layoutRow(row({ cells: [3, 3, 7, 9, 9] }), milestones, none, 2026)

    expect(layout.clusters).toEqual([
      { at: 3, years: 3, indices: [0, 1] },
      { at: 7, years: 7, indices: [2] },
      { at: 9, years: 9, indices: [3, 4] },
    ])
    expect(layout.gutter).toEqual([])
    expect(layout.beyond).toEqual([])
  })

  it('collapses the milestones already there, and those not within the horizon', () => {
    const layout = layoutRow(row({ cells: [0, 0, 6, null, null] }), milestones, none, 2026)

    expect(layout.gutter).toEqual([0, 1])
    expect(layout.beyond).toEqual([3, 4])
    expect(layout.clusters.map((c) => c.indices)).toEqual([[2]])
  })

  it('counts a milestone the check-ins reached as already there, whatever the path says', () => {
    const layout = layoutRow(row({ cells: [4, 5, 6, 7, 8] }), milestones, new Map([[100_000, "2026-05-14"]]), 2026)

    expect(layout.gutter).toEqual([0])
    expect(layout.clusters.map((c) => c.years)).toEqual([5, 6, 7, 8])
  })

  it('places everything where the path reaches it when every milestone is reached, bar those met at the start', () => {
    const all = new Map(milestones.map((m) => [m.amountCents, '2026-05-14'] as const))
    const layout = layoutRow(row({ cells: [0, 4, 5, 7, null] }), milestones, all, 2026)

    expect(layout.gutter).toEqual([0])
    expect(layout.clusters.map((c) => c.years)).toEqual([4, 5, 7])
    expect(layout.beyond).toEqual([4])
  })

  it('shifts the dots of a path that starts later along the axis', () => {
    const layout = layoutRow(row({ cells: [3], startDate: '2028-01-01' }), ms(1), none, 2026)

    expect(layout.clusters).toEqual([{ at: 5, years: 3, indices: [0] }])
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

  it('says what a dot for several milestones stands for', () => {
    expect(describeCluster(r, 6, ['300k €', '400k €'])).toBe('Path A reaches 300k € and 400k € in 6 years, by 2032.')
    expect(describeCluster(r, 1, ['300k €', 'House deposit (400k €)', '500k €'])).toBe(
      'Path A reaches 300k €, House deposit (400k €) and 500k € in 1 year, by 2027.',
    )
  })

  it('says why each milestone in the left badge is already there', () => {
    expect(describeGutter(r, ['100k €', '200k €'], ["reached by May '26", 'met at its start'])).toBe(
      "Path A already has 100k € (reached by May '26) and 200k € (met at its start).",
    )
  })

  it('says which milestones are past the end of the path', () => {
    expect(describeBeyond(r, ['500k €'])).toBe('Path A does not reach 500k € within its 25 year horizon.')
    expect(describeBeyond(r, ['500k €', '750k €'])).toBe('Path A does not reach 500k € and 750k € within its 25 year horizon.')
  })
})
