import { describe, expect, it } from 'vitest'
import { EU_MONEY_FORMAT, resolveMoneyFormat } from '../../../engine/money'
import { aboutOnAccount, bothMoneys, bothMoneysSentence, bothMoneysTail, onAccountCents, onAccountLabel, onAccountPhrase } from './bothMoneys'
import { yearLabel } from './yearLabel'

const money = (cents: number) => `${Math.round(cents / 100).toLocaleString('de-DE')} €`

describe('yearLabel', () => {
  it('is the calendar year with a start date, and the year of the plan without one', () => {
    expect(yearLabel(13, '2026-01-01')).toBe('2039')
    expect(yearLabel(0, '2026-07-15')).toBe('2026')
    expect(yearLabel(13, null)).toBe('year 13')
  })
})

describe('onAccountCents', () => {
  it('is the plan money grown by the inflation for the years between, which is what the account shows', () => {
    // 30.000 euros of 2026 prices is 36.570 euros on the account in ten years at 2%.
    expect(onAccountCents(3_000_000, 10, 0.02)).toBe(3_656_983)
    expect(onAccountCents(3_000_000, 0, 0.02)).toBe(3_000_000)
    expect(onAccountCents(3_000_000, 10, 0)).toBe(3_000_000)
  })

  it('goes back to the plan money by the same factor, within a cent of rounding', () => {
    for (const years of [1, 7, 30, 60]) {
      const account = onAccountCents(12_345_600, years, 0.03)
      expect(Math.abs(account / Math.pow(1.03, years) - 12_345_600)).toBeLessThanOrEqual(1)
    }
  })
})

describe('onAccountLabel', () => {
  it('names the calendar year of the account, or the plan year with no start date', () => {
    expect(onAccountLabel(30, '2026-01-01')).toBe('on your account in 2056')
    expect(onAccountLabel(30, null)).toBe('on your account in year 30')
  })
})

describe('bothMoneys', () => {
  const args = { cents: 3_000_000, years: 10, planStartDate: '2026-01-01', inflationRate: 0.02, money, format: EU_MONEY_FORMAT }

  it('names the plan\'s money after the currency the owner tracks in', () => {
    const usd = bothMoneys({ ...args, format: resolveMoneyFormat('USD', 'en-US') })
    expect(usd.planLabel).toBe('2026 US dollars')
    expect(bothMoneysTail(usd)).toBe('in 2026 US dollars, about 36.570 € on your account in 2036')
  })

  it('says an amount in the plan\'s euros and on the account when it is reached', () => {
    expect(bothMoneys(args)).toEqual({
      plan: '30.000 €',
      account: '36.570 €',
      planLabel: '2026 euros',
      accountLabel: 'on your account in 2036',
      same: false,
    })
  })

  it('reads as one sentence, the plan\'s euros first', () => {
    expect(bothMoneysSentence(bothMoneys(args))).toBe('30.000 € in 2026 euros, about 36.570 € on your account in 2036')
  })

  it('has a tail for an amount already written out, which is the sentence without the amount', () => {
    const b = bothMoneys(args)
    expect(bothMoneysTail(b)).toBe('in 2026 euros, about 36.570 € on your account in 2036')
    expect(bothMoneysSentence(b)).toBe(`${b.plan} ${bothMoneysTail(b)}`)
  })

  it('has the account half alone, for a place with little room', () => {
    expect(onAccountPhrase(bothMoneys(args))).toBe('36.570 € on your account in 2036')
    expect(onAccountPhrase(bothMoneys({ ...args, inflationRate: 0 }))).toBe('the same on your account in 2036')
    expect(aboutOnAccount(bothMoneys(args))).toBe('about 36.570 € on your account in 2036')
    expect(aboutOnAccount(bothMoneys({ ...args, inflationRate: 0 }))).toBe('the same on your account in 2036')
  })

  it('says the two are the same, once, when there is no inflation or no time between', () => {
    const none = bothMoneys({ ...args, inflationRate: 0 })
    expect(none.same).toBe(true)
    expect(bothMoneysSentence(none)).toBe('30.000 € in 2026 euros, the same on your account in 2036')
    expect(bothMoneys({ ...args, years: 0 }).same).toBe(true)
  })

  it('names the plan\'s money "today\'s euros" and the year "year N" for a plan with no start date', () => {
    expect(bothMoneysSentence(bothMoneys({ ...args, planStartDate: null }))).toBe(
      "30.000 € in today's euros, about 36.570 € on your account in year 10",
    )
  })

  it('is the same when the two amounts round to the same figure, though the inflation is not nothing', () => {
    const tiny = bothMoneys({ ...args, cents: 1_000, years: 1, inflationRate: 0.02 })
    expect(tiny.same).toBe(true)
  })
})
