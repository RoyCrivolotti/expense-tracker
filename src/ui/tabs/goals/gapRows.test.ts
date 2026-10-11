import { describe, expect, it } from 'vitest'
import type { GapSplit } from '../../../engine'
import { gapRows } from './gapRows'

const split = (parts: Partial<GapSplit['parts']>, over: Partial<GapSplit> = {}): GapSplit => {
  const all = { timing: 0, start: 0, saving: 0, market: 0, ...parts }
  return {
    kind: 'split',
    gapCents: all.timing + all.start + all.saving + all.market,
    verdict: 'ahead',
    fromDate: '2026-03-01',
    toDate: '2027-03-01',
    beforeFirstCheckin: false,
    parts: all,
    merged: null,
    recordedShort: false,
    accountsChanged: false,
    plannedMonthCents: 100_000,
    ...over,
  }
}
const labels = (s: GapSplit) => gapRows(s).map((r) => r.label)

describe('gapRows', () => {
  it('names each part by its sign and leaves the ones that are nothing out', () => {
    expect(labels(split({ start: -100_000, saving: 900_000, market: 400_000 }))).toEqual([
      'You started behind the plan',
      'Investing more than planned',
      'The market doing better than the plan assumes',
    ])
    expect(labels(split({ start: 100_000, saving: -900_000, market: -400_000 }))).toEqual([
      'You started ahead of the plan',
      'Investing less than planned',
      'The market doing worse than the plan assumes',
    ])
  })

  it('says investing was about as planned when it is under a planned month either way', () => {
    expect(labels(split({ saving: 90_000, market: 500_000 }))).toContain('Investing about as planned')
    expect(labels(split({ saving: -90_000, market: 500_000 }))).toContain('Investing about as planned')
    expect(labels(split({ saving: 110_000, market: 500_000 }))).toContain('Investing more than planned')
  })

  it('calls the start what happened before the first check-in when that came more than a month in', () => {
    expect(labels(split({ start: 500_000 }, { beforeFirstCheckin: true }))).toEqual(['Ahead before your first check-in'])
    expect(labels(split({ start: -500_000 }, { beforeFirstCheckin: true }))).toEqual(['Behind before your first check-in'])
  })

  it('puts saving and the market in one row when they cannot be told apart', () => {
    const rows = gapRows(split({ saving: -300_000, market: 100_000, start: 50_000 }, { merged: 'none-recorded' }))
    expect(rows.map((r) => [r.label, r.euros])).toEqual([
      ['You started ahead of the plan', 500],
      ['Your investing and the market together', -2000],
    ])
  })

  it('keeps the way the plan counts time as a muted line of its own, never folded into another', () => {
    const rows = gapRows(split({ start: 500_000, timing: -30_000 }))
    expect(rows).toEqual([
      { key: 'start', label: 'You started ahead of the plan', euros: 5000 },
      { key: 'timing', label: "The plan's line moves a year at a time (not something you did)", euros: -300, muted: true },
    ])
  })

  it('shows whole euros that add up to the gap in whole euros, whatever the cents are', () => {
    const parts = { start: 123_456, saving: 99_950, market: -50_050, timing: 333 }
    const s = split(parts)
    const total = gapRows(s).reduce((sum, r) => sum + r.euros, 0)
    expect(total).toBe(Math.round(s.gapCents / 100))
  })

  it('has no rows when every part rounds to nothing', () => {
    expect(gapRows(split({ start: 30, saving: -20, market: 10, timing: -20 }))).toEqual([])
  })
})
