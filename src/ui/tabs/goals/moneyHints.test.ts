import { describe, expect, it } from 'vitest'
import { EU_MONEY_FORMAT, scenarioToParams, yearsToFi } from '../../../engine'
import { samplePlan, SAMPLE_INFLATION } from '../../../testing/samplePlan'
import { onAccountCents } from './bothMoneys'
import { rentMoneyHint, spendMoneyHint } from './moneyHints'

const spend = (over = {}, inflation = SAMPLE_INFLATION) => spendMoneyHint(samplePlan(over), inflation, EU_MONEY_FORMAT)
const rent = (over = {}, inflation = SAMPLE_INFLATION) => rentMoneyHint(samplePlan(over), inflation, EU_MONEY_FORMAT)

describe('spendMoneyHint', () => {
  it('says what the spending comes to on the account when the plan ends, when FI is never reached', () => {
    // 30.000 euros of 2026 a year, which the sample plan never reaches FI on: 30.000 x 1,02^30 = 54.341 euros
    // on the account in 2056.
    expect(spend()).toBe(
      'Counted in 2026 euros: about 54.341 € a year on your account in 2056, when the plan ends (FI is not reached).',
    )
  })

  it('says it where the plan reaches FI when it does', () => {
    const plan = samplePlan({ annualSpendCents: 1_200_000 })
    const year = yearsToFi(scenarioToParams(plan, SAMPLE_INFLATION), plan.annualSpendCents, plan.safeWithdrawalRate)
    expect(year).not.toBeNull()
    const account = new Intl.NumberFormat('de-DE').format(Math.round(onAccountCents(1_200_000, year!, SAMPLE_INFLATION) / 100))
    expect(spend({ annualSpendCents: 1_200_000 })).toBe(
      `Counted in 2026 euros: about ${account} € a year on your account in ${2026 + year!}, the year the plan reaches FI.`,
    )
  })

  it('says the same, once, with no inflation (where the plan does reach FI, as its saving is not shrunk by it)', () => {
    const plan = samplePlan()
    const year = yearsToFi(scenarioToParams(plan, 0), plan.annualSpendCents, plan.safeWithdrawalRate)
    expect(year).not.toBeNull()
    expect(spend({}, 0)).toBe(`Counted in 2026 euros: the same on your account in ${2026 + year!}, the year the plan reaches FI.`)
  })

  it("names today's euros for a plan with no start date, and the year by the plan year", () => {
    expect(spend({ planStartDate: null })).toBe(
      "Counted in today's euros: about 54.341 € a year on your account in year 30, when the plan ends (FI is not reached).",
    )
  })

  it('has nothing to say for no spending', () => {
    expect(spend({ annualSpendCents: 0 })).toBeNull()
  })
})

describe('rentMoneyHint', () => {
  it('says what the rent comes to on the account in the year the house is bought, as it rises with the inflation', () => {
    // 1.000 euros a month of 2026 in year 8: 1.000 x 1,02^8 = 1.172 euros.
    expect(rent()).toBe('Counted in 2026 euros and rising with inflation: about 1.172 € a month on your account in 2034, the year you buy.')
  })

  it('says it ten years on when no house is planned, and when one is already owned', () => {
    // 1.000 x 1,02^10 = 1.219.
    const text = 'Counted in 2026 euros and rising with inflation: about 1.219 € a month on your account in 2036, ten years on.'
    expect(rent({ housePurchaseYear: null })).toBe(text)
    expect(rent({ housePurchaseYear: 0 })).toBe(text)
  })

  it('says the same, once, with no inflation', () => {
    expect(rent({}, 0)).toBe('Counted in 2026 euros and rising with inflation: the same on your account in 2034, the year you buy.')
  })

  it('has nothing to say for no rent', () => {
    expect(rent({ rentMonthlyCents: 0 })).toBeNull()
  })
})
