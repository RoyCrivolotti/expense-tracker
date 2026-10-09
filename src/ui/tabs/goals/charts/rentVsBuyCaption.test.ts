import { describe, expect, it } from 'vitest'
import { EU_MONEY_FORMAT } from '../../../../engine/money'
import { rentVsBuyCaption } from './rentVsBuyCaption'

const money = (cents: number) => `${(cents / 100).toLocaleString('de-DE')} €`
const base = { upfrontCents: 6_600_000, priceCents: 32_435_282, startYear: 8, moneyLabel: '2026 euros', carryRate: 0.015, paymentCents: 144_172, money, format: EU_MONEY_FORMAT }

describe('rentVsBuyCaption', () => {
  it('says both start with the same cash and spend the same, what each does with it, and the money it is in', () => {
    const text = rentVsBuyCaption(base)
    expect(text).toContain('Both start with 66.000 € in cash (the down payment and fees) and spend the same in total on housing and investing every month.')
    expect(text).toContain('The renter invests the cash and whatever owning would cost above the rent')
    expect(text).toContain('the buyer owns the house, owes the loan and invests whatever rent would cost above owning')
    expect(text).toContain('In 2026 euros.')
  })

  it('says when it compares from: the purchase year at the price then, or as if bought today', () => {
    expect(rentVsBuyCaption(base)).toContain('Compared from year 8 of the plan, when it buys, at the 324.352,82 € the house will cost then.')
    expect(rentVsBuyCaption({ ...base, startYear: 0 })).toContain('Compared as if you bought today, at 324.352,82 €.')
  })

  it("states the assumptions it makes: rent flat in real terms, the scenario's own upkeep, no costs of selling", () => {
    const text = rentVsBuyCaption({ ...base, carryRate: 0.04 })
    expect(text).toContain("Assumes rent stays the same in real terms, upkeep, tax and insurance of 4,0% of the house's value a year, and no costs of selling.")
    expect(rentVsBuyCaption({ ...base, carryRate: 0 })).toContain("upkeep, tax and insurance of 0,0% of the house's value a year")
  })

  it("says these are the two choices on their own, so they are not compared with the plan's net worth", () => {
    expect(rentVsBuyCaption(base)).toContain(
      "These are the two choices on their own, without your starting portfolio and contributions, so they will not match the plan's net worth.",
    )
  })

  it('says what the loan costs on the account, which is fixed, so it shrinks in the plan\'s euros, and nothing without a loan', () => {
    expect(rentVsBuyCaption(base)).toContain('The loan costs 1.441,72 € a month on the account and stays that, so in these euros it shrinks each year.')
    expect(rentVsBuyCaption({ ...base, paymentCents: 0 })).not.toContain('The loan costs')
  })
})
