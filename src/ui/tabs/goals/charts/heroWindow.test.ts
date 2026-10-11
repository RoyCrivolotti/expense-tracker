import { describe, expect, it } from 'vitest'
import { clipToWindow, heroWindowsFor, insideWindow } from './heroWindow'
import type { ChartSeries } from '../../../charts/LinearChart'

const years = [0, 1, 2, 3, 4, 5, 6]
const series: ChartSeries[] = [
  { id: 'line', color: '#000', values: [0, 1, 2, 3, 4, 5, 6] },
  { id: 'band', color: '#000', values: [], kind: 'band', band: { lo: [0, 1, 2, 3, 4, 5, 6], hi: [1, 2, 3, 4, 5, 6, 7] } },
  { id: 'dots', color: '#000', values: [], kind: 'scatter', points: [{ xIndex: 1.5, value: 1 }, { xIndex: 5.5, value: 5 }] },
]

describe('clipToWindow', () => {
  it('cuts years, values, bands and dots at the window, and leaves All alone', () => {
    const cut = clipToWindow(years, series, 3)
    expect(cut.years).toEqual([0, 1, 2, 3])
    expect(cut.series[0]!.values).toEqual([0, 1, 2, 3])
    expect(cut.series[1]!.band).toEqual({ lo: [0, 1, 2, 3], hi: [1, 2, 3, 4] })
    expect(cut.series[2]!.points).toEqual([{ xIndex: 1.5, value: 1 }])
    expect(clipToWindow(years, series, null)).toEqual({ years, series })
  })
})

describe('heroWindowsFor', () => {
  it('offers only the windows shorter than the horizon, and always All', () => {
    expect(heroWindowsFor(30).map((w) => w.label)).toEqual(['5Y', '10Y', '20Y', 'All'])
    expect(heroWindowsFor(10).map((w) => w.label)).toEqual(['5Y', 'All'])
    expect(heroWindowsFor(5).map((w) => w.label)).toEqual(['All'])
  })
})

describe('insideWindow', () => {
  it('keeps a marker inside the window and drops one past it or missing', () => {
    expect(insideWindow(4, 5)).toBe(true)
    expect(insideWindow(6, 5)).toBe(false)
    expect(insideWindow(6, null)).toBe(true)
    expect(insideWindow(undefined, null)).toBe(false)
  })
})

describe('clipToWindow through a step', () => {
  const stepped: ChartSeries[] = [
    { id: 'line', color: '#000', values: [0, 1, 2, 3, 4, 5, 6], preStep: [0, 1, 2, 9, 4, 5, 6] },
    {
      id: 'band',
      color: '#000',
      values: [],
      kind: 'band',
      band: { lo: [0, 1, 2, 3, 4, 5, 6], hi: [1, 2, 3, 4, 5, 6, 7], loPre: [0, 1, 2, 8, 4, 5, 6], hiPre: [1, 2, 3, 10, 5, 6, 7] },
    },
  ]

  it('cuts what a line and its band reached before a step to the same length as their values', () => {
    // Left at full length they would stretch the axis to a payment past the window, and a band without
    // its steps would let the line climb out of it at a purchase.
    const cut = clipToWindow(years, stepped, 2)
    expect(cut.series[0]!.values).toEqual([0, 1, 2])
    expect(cut.series[0]!.preStep).toEqual([0, 1, 2])
    expect(cut.series[1]!.band).toEqual({ lo: [0, 1, 2], hi: [1, 2, 3], loPre: [0, 1, 2], hiPre: [1, 2, 3] })
  })

  it('keeps a step that is inside the window', () => {
    const cut = clipToWindow(years, stepped, 4)
    expect(cut.series[0]!.preStep).toEqual([0, 1, 2, 9, 4])
    expect(cut.series[1]!.band?.hiPre).toEqual([1, 2, 3, 10, 5])
  })

  it('does not invent steps for a line that has none', () => {
    const cut = clipToWindow(years, series, 3)
    expect(cut.series[0]).not.toHaveProperty('preStep')
    expect(cut.series[1]!.band).not.toHaveProperty('loPre')
  })
})
