import { describe, expect, it } from 'vitest'
import { planMoneyLabel } from './planMoneyLabel'

describe('planMoneyLabel', () => {
  it('names the money by the year the plan starts', () => {
    expect(planMoneyLabel('2026-01-01')).toBe('2026 euros')
    expect(planMoneyLabel('2031-11-30')).toBe('2031 euros')
  })

  it.each([
    ['no start date', null],
    ['an empty one', ''],
    ['one that is not a date', 'soon'],
  ])('falls back to today for %s', (_name, date) => {
    expect(planMoneyLabel(date)).toBe("today's euros")
  })
})
