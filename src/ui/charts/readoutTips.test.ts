import { describe, expect, it } from 'vitest'
import { summaryOf, tallestTip, type ReadoutTip } from './readoutTips'

const tip = (title: string, ...labels: string[]): ReadoutTip => ({
  title,
  lines: labels.map((label) => ({ label, value: '1' })),
})

describe('summaryOf', () => {
  it('keeps the summary lines and leaves the detail lines for under the chart', () => {
    const full: ReadoutTip = {
      title: 'Year 5',
      lines: [{ label: 'Net worth', value: '1' }, { label: 'Start of year', value: '2', variant: 'detail' }],
    }
    expect(summaryOf(full)).toEqual({ title: 'Year 5', lines: [{ label: 'Net worth', value: '1' }] })
  })
})

describe('tallestTip', () => {
  it('picks the tip with the most lines, the first of any tie', () => {
    expect(tallestTip([tip('a', 'x'), tip('b', 'x', 'y'), tip('c', 'x', 'y')])?.title).toBe('b')
  })

  it('has nothing to pick from nothing', () => {
    expect(tallestTip([])).toBeNull()
  })
})
