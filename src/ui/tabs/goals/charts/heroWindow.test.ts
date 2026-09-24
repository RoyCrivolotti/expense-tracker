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
