import { describe, expect, it } from 'vitest'
import { EU_MONEY_FORMAT } from '../../../../engine/money'
import type { RentVsBuyPoint } from '../../../../engine'
import { rentVsBuyTooltip } from './rentVsBuyTooltip'

const point = (over: Partial<RentVsBuyPoint> = {}): RentVsBuyPoint => ({
  year: 5,
  rentNetWorthCents: 54_000_000,
  buyNetWorthCents: 43_500_000,
  rentSeedCents: 40_000_000,
  rentExtraCents: 14_000_000,
  houseValueCents: 31_000_000,
  loanLeftCents: 18_000_000,
  buySavingsCents: 3_000_000,
  rentHousingMonthlyCents: 100_000,
  buyHousingMonthlyCents: 118_000,
  rentInvestsMonthlyCents: 18_000,
  buyInvestsMonthlyCents: 0,
  ...over,
})
const ctx = { format: EU_MONEY_FORMAT, rentColor: 'red', buyColor: 'blue' }
const value = (lines: { label: string; value: string }[], label: string) => lines.find((l) => l.label === label)?.value

describe('rentVsBuyTooltip', () => {
  it('titles the year by the years since buying, and the first as the day of the purchase', () => {
    expect(rentVsBuyTooltip([point({ year: 0 })], 0, ctx).title).toBe('The day you buy')
    expect(rentVsBuyTooltip([point({ year: 1 })], 0, ctx).title).toBe('1 year after buying')
    expect(rentVsBuyTooltip([point({ year: 12 })], 0, ctx).title).toBe('12 years after buying')
  })

  it('gives the two totals the colour of their lines and nothing else', () => {
    const { lines } = rentVsBuyTooltip([point()], 0, ctx)
    expect(lines.filter((l) => l.color).map((l) => [l.label, l.color])).toEqual([
      ['Renter total', 'red'],
      ['Buyer total', 'blue'],
    ])
  })

  it('lists what each side holds, with the loan as what is taken off', () => {
    const { lines } = rentVsBuyTooltip([point()], 0, ctx)
    expect(value(lines, 'Renter: start cash, grown')).toBe('400k €')
    expect(value(lines, 'Renter: invested since')).toBe('140k €')
    expect(value(lines, 'Buyer: house worth')).toBe('310k €')
    expect(value(lines, 'Buyer: loan left')).toBe('-180k €')
    expect(value(lines, 'Buyer: savings')).toBe('30k €')
  })

  it('says what each pays and invests a month, in whole euros', () => {
    const { lines } = rentVsBuyTooltip([point()], 0, ctx)
    expect(value(lines, 'Renter pays a month')).toBe('1.000 €')
    expect(value(lines, 'Renter invests a month')).toBe('180 €')
    expect(value(lines, 'Buyer pays a month')).toBe('1.180 €')
    expect(value(lines, 'Buyer invests a month')).toBe('nothing')
  })

  it('says what the year before had when the buyer’s investing jumps, as it does when the loan is paid off', () => {
    const before = point({ year: 25, buyInvestsMonthlyCents: 4_000 })
    const after = point({ year: 26, buyInvestsMonthlyCents: 61_000, buyHousingMonthlyCents: 39_000 })
    const { lines } = rentVsBuyTooltip([before, after], 1, ctx)
    expect(value(lines, 'Buyer invests a month')).toBe('610 € (was 40 €)')
  })

  it('says nothing of the year before for a small change, which is what most years are', () => {
    const before = point({ year: 4, buyInvestsMonthlyCents: 40_000 })
    const after = point({ year: 5, buyInvestsMonthlyCents: 41_500 })
    expect(value(rentVsBuyTooltip([before, after], 1, ctx).lines, 'Buyer invests a month')).toBe('415 €')
  })

  it('has no month to speak of on the day of the purchase, and no savings yet', () => {
    const first = point({ year: 0, buySavingsCents: 0, rentExtraCents: 0, rentHousingMonthlyCents: 0, buyHousingMonthlyCents: 0, rentInvestsMonthlyCents: 0 })
    const { lines } = rentVsBuyTooltip([first], 0, ctx)
    const labels = lines.map((l) => l.label)
    expect(labels).not.toContain('Renter pays a month')
    expect(labels).not.toContain('Buyer: savings')
    expect(labels).not.toContain('Renter: invested since')
  })

  it('gives each row a name of its own, since the rows are keyed by it, and keeps the parts smaller than the totals', () => {
    const { lines } = rentVsBuyTooltip([point()], 0, ctx)
    expect(new Set(lines.map((l) => l.label)).size).toBe(lines.length)
    expect(lines.filter((l) => l.variant === 'detail').length).toBe(lines.length - 2)
  })
})
