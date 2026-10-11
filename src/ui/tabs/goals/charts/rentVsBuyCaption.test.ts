import { describe, expect, it } from 'vitest'
import { EU_MONEY_FORMAT } from '../../../../engine/money'
import { rentVsBuyCaption, rentVsBuyCaptionParts } from './rentVsBuyCaption'

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
  it('leads with what both sides start with, what each does with it, what it is priced at, which euros, and what it leaves out', () => {
    const { lead } = rentVsBuyCaptionParts(base)
    expect(lead).toBe(
      "Both start with 66.000 € and spend the same each month: the renter invests the difference, the buyer owns the house. Compared from year 8, at the 324.352,82 € the house will cost then, in 2026 euros, with selling costs left out. Who leads depends on the return and house growth; this is not the plan's net worth.",
    )
  })

  it('prices a purchase today at the price today, and a later one at what the house costs then', () => {
    expect(rentVsBuyCaptionParts({ ...base, startYear: 0 }).lead).toContain('Priced as if bought today, at 324.352,82 €, in 2026 euros')
    expect(rentVsBuyCaptionParts(base).lead).toContain('Compared from year 8, at the 324.352,82 € the house will cost then')
  })

  it('keeps what stops a wrong decision in view and the long assumptions behind the disclosure: the lead is about 50 words', () => {
    const { lead, details } = rentVsBuyCaptionParts(base)
    expect(lead.split(/\s+/).length).toBeLessThanOrEqual(60)
    // Said in the lead, so not said again behind it.
    expect(details.join(' ')).not.toContain('Both start with')
    expect(details.join(' ')).not.toContain('Compared from year')
    // The detail is still all there, for whoever opens it.
    expect(details.length).toBeGreaterThanOrEqual(6)
  })

  it('is the lead and the detail together as one text', () => {
    const parts = rentVsBuyCaptionParts(base)
    expect(rentVsBuyCaption(base)).toBe([parts.lead, ...parts.details].join(' '))
  })

  it('says which way what it leaves out leans, so a close result can be read against it', () => {
    const text = rentVsBuyCaption(base)
    expect(text).toContain('Rent that rises faster than prices favours buying; selling costs and renovation favour renting')
    expect(text).toContain('mortgage interest relief and tax on investment gains depend on your country and are not counted')
  })

  it("states the assumptions it makes: rent flat in real terms, the scenario's own upkeep, no costs of selling", () => {
    const text = rentVsBuyCaption({ ...base, carryRate: 0.04 })
    expect(text).toContain("Assumes rent stays the same in real terms, upkeep, tax and insurance of 4,0% of the house's value a year, and no costs of selling.")
    expect(rentVsBuyCaption({ ...base, carryRate: 0 })).toContain("upkeep, tax and insurance of 0,0% of the house's value a year")
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
