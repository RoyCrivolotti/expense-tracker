import { describe, expect, it } from 'vitest'
import { EU_MONEY_FORMAT, resolveMoneyFormat } from '../../../engine/money'
import { chartMoneyLabel, planMoneyLabel } from './planMoneyLabel'

const USD = resolveMoneyFormat('USD', 'en-US')

describe('planMoneyLabel', () => {
  it('names the money by the year the plan starts', () => {
    expect(planMoneyLabel('2026-01-01', EU_MONEY_FORMAT)).toBe('2026 euros')
    expect(planMoneyLabel('2031-11-30', EU_MONEY_FORMAT)).toBe('2031 euros')
  })

  it.each([
    ['no start date', null],
    ['an empty one', ''],
    ['one that is not a date', 'soon'],
  ])('falls back to today for %s', (_name, date) => {
    expect(planMoneyLabel(date, EU_MONEY_FORMAT)).toBe("today's euros")
  })

  it('names the money of the currency the owner tracks in, not the euro', () => {
    expect(planMoneyLabel('2026-01-01', USD)).toBe('2026 US dollars')
    expect(planMoneyLabel(null, USD)).toBe("today's US dollars")
    expect(planMoneyLabel('2026-01-01', resolveMoneyFormat('GBP', 'en-GB'))).toBe('2026 British pounds')
  })
})

describe('chartMoneyLabel', () => {
  it('names the plan\'s money, or what the account will read in each year in the Nominal view', () => {
    expect(chartMoneyLabel('2026-01-01', false, EU_MONEY_FORMAT)).toBe('in 2026 euros')
    expect(chartMoneyLabel('2026-01-01', true, EU_MONEY_FORMAT)).toBe('in euros on your account in each year')
  })

  it('does so in the currency of the owner', () => {
    expect(chartMoneyLabel('2026-01-01', false, USD)).toBe('in 2026 US dollars')
    expect(chartMoneyLabel('2026-01-01', true, USD)).toBe('in US dollars on your account in each year')
  })
})
