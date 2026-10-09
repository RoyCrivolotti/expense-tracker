import { describe, expect, it } from 'vitest'
import { EU_MONEY_FORMAT } from '../../../../engine/money'
import { rentVsBuyCaption } from './rentVsBuyCaption'

const money = (cents: number) => `${(cents / 100).toLocaleString('de-DE')} €`
const base = {
  upfrontCents: 6_600_000,
  feesCents: 600_000,
  priceCents: 32_435_282,
  startYear: 8,
  moneyLabel: '2026 euros',
  carryRate: 0.015,
  realReturn: 0.05,
  houseGrowth: 0.0098,
  paymentCents: 144_172,
  ownCheaper: { fromYear: 26, stays: true },
  loanPaidOffYear: 25,
  money,
  format: EU_MONEY_FORMAT,
}

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

  it('says the buyer spends the fees at once, so the buyer\'s line starts lower, and nothing when there are none', () => {
    expect(rentVsBuyCaption(base)).toContain("The buyer spends the 6.000 € fees at once, so the buyer's line starts lower.")
    expect(rentVsBuyCaption({ ...base, feesCents: 0 })).not.toContain('fees at once')
  })

  it('says what the two sides grow at, since who leads depends on it', () => {
    expect(rentVsBuyCaption(base)).toContain(
      "Savings grow at the plan's 5,0% a year and the house gains 1,0% a year, both after inflation: a different return or house growth can change who leads.",
    )
    expect(rentVsBuyCaption({ ...base, realReturn: 0.07, houseGrowth: 0 })).toContain("the plan's 7,0% a year and the house gains 0,0% a year")
  })

  it('says that the plan takes only the down payment and the fees from the portfolio, so while owning costs more a month than renting a house adds more to its net worth than here', () => {
    const text = rentVsBuyCaption(base)
    expect(text).toContain(
      'The plan only takes the down payment and fees from your portfolio, not the loan or upkeep, so while owning costs more a month than renting, a house adds more to its net worth than it does here.',
    )
    // True only while owning costs more: with a rent that makes owning the cheaper month, the buyer's line gains from it.
    expect(text).not.toContain('so a house adds more')
  })

  it('says when the loan is paid off, in the year after buying it falls in, part way through a year too', () => {
    expect(rentVsBuyCaption(base)).toContain('The loan is paid off in year 25 after you buy.')
    expect(rentVsBuyCaption({ ...base, loanPaidOffYear: 24 + 7 / 12 })).toContain('The loan is paid off in year 25 after you buy.')
    expect(rentVsBuyCaption({ ...base, loanPaidOffYear: null })).not.toContain('The loan is paid off')
  })

  it('says what owning costs a month against renting, in the same words as the marker on the chart', () => {
    expect(rentVsBuyCaption(base)).toContain('From year 26 owning costs less a month than renting, for the rest of the chart.')
    expect(rentVsBuyCaption({ ...base, ownCheaper: { fromYear: 26, stays: false } })).toContain(
      'Owning first costs less a month than renting in year 26, though not for the rest of the chart.',
    )
    expect(rentVsBuyCaption({ ...base, ownCheaper: null })).toContain('Owning costs at least as much a month as renting throughout.')
  })
})
