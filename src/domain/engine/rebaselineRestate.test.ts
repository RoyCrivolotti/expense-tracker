import { describe, expect, it } from 'vitest'
import { samplePlan, SAMPLE_INFLATION } from '../../testing/samplePlan'
import { makeScenario } from '../../testing/factories'
import { dateAtYears, yearsBetween } from './dates'
import { projectNetWorth } from './projection'
import { EU_MONEY_FORMAT } from './money'
import { rebaseline, rebaselineSummary } from './rebaselinePatch'
import { scenarioToParams } from './scenarioProjection'
import type { GoalScenario } from '../types'

const I = SAMPLE_INFLATION
const g = 1 + I
const checkin = (investedCents: number, date: string) => ({ investedCents, date })
const apply = (plan: GoalScenario, patch: object): GoalScenario => ({ ...plan, ...patch })
const say = (r: ReturnType<typeof rebaseline>) => rebaselineSummary(r, EU_MONEY_FORMAT, (iso) => iso)

describe('rebaseline restates what is typed in the euros of the old start', () => {
  const plan = samplePlan({ lifeEvents: [{ year: 6, amountCents: -2_000_000, label: 'Car' }, { year: 2, amountCents: 1_000_000, label: 'Gift' }] })

  it('brings spending, rent and fees to the euros of the new start: 30.000 of 2026 is 31.836 three years on', () => {
    const { patch } = rebaseline(plan, checkin(7_000_000, '2029-01-01'), I)
    expect(patch.annualSpendCents).toBe(Math.round(3_000_000 * g ** 3))
    expect(patch.annualSpendCents).toBe(3_183_624)
    expect(patch.rentMonthlyCents).toBe(Math.round(100_000 * g ** 3))
    expect(patch.transactionCostsCents).toBe(Math.round(600_000 * g ** 3))
  })

  it('restates the amounts of the events still to come, and drops the one already in the balance', () => {
    const { patch, droppedLifeEvents } = rebaseline(plan, checkin(7_000_000, '2029-01-01'), I)
    expect(droppedLifeEvents.map((e) => e.label)).toEqual(['Gift'])
    expect(patch.lifeEvents).toEqual([{ year: 3, amountCents: Math.round(-2_000_000 * g ** 3), label: 'Car' }])
  })

  it('leaves the monthly amount alone: it is in euros as sent, not in the euros of a year', () => {
    const { patch } = rebaseline(plan, checkin(7_000_000, '2029-01-01'), I)
    expect(patch.monthlyContributionCents).toBe(100_000)
  })

  it('restates by the calendar years elapsed, to the day, not by whole years', () => {
    const { patch } = rebaseline(plan, checkin(7_000_000, '2028-07-01'), I)
    expect(patch.annualSpendCents).toBe(Math.round(3_000_000 * g ** yearsBetween('2026-01-01', '2028-07-01')))
  })

  it('restates nothing at no inflation, for a plan with no start date, or when the date does not move forward', () => {
    expect(rebaseline(plan, checkin(7_000_000, '2029-01-01'), 0).patch.annualSpendCents).toBe(3_000_000)
    const undated = { ...plan, planStartDate: null }
    expect(rebaseline(undated, checkin(7_000_000, '2029-01-01'), I).patch.annualSpendCents).toBe(3_000_000)
    expect(rebaseline(plan, checkin(7_000_000, '2026-01-01'), I).patch.annualSpendCents).toBe(3_000_000)
    expect(rebaseline(plan, checkin(7_000_000, '2025-06-01'), I).patch.annualSpendCents).toBe(3_000_000)
  })

  it('restates every amount of a plan it does not otherwise change, the same for a draft and for the saved plan', () => {
    const a = rebaseline(plan, checkin(7_000_000, '2029-01-01'), I).patch
    const b = rebaseline({ ...plan }, checkin(7_000_000, '2029-01-01'), I).patch
    expect(a).toEqual(b)
  })
})

describe('rebaseline restates the price of a house not yet bought by the house’s own growth', () => {
  it('is today’s price grown at the appreciation, not at the inflation: 300.000 at 3% for three years', () => {
    const plan = samplePlan()
    const { patch } = rebaseline(plan, checkin(7_000_000, '2029-01-01'), I)
    expect(patch.housePriceCents).toBe(Math.round(30_000_000 * 1.03 ** 3))
    expect(patch.housePurchaseYear).toBe(5)
  })

  it('restates a price kept for Rent vs buy too, when no purchase is planned', () => {
    const plan = samplePlan({ housePurchaseYear: null })
    expect(rebaseline(plan, checkin(7_000_000, '2029-01-01'), I).patch.housePriceCents).toBe(Math.round(30_000_000 * 1.03 ** 3))
  })

  it('keeps the price a purchase carried to a later year buys at, as today’s price grown the whole way', () => {
    const plan = samplePlan()
    // The plan restarts on 1 July 2029; the purchase (1 January 2034) is carried to the next anniversary of that start.
    const { patch } = rebaseline(plan, checkin(7_000_000, '2029-07-01'), I)
    expect(patch.housePurchaseYear).toBe(5)
    expect(patch.housePriceCents).toBe(Math.round(30_000_000 * 1.03 ** yearsBetween('2026-01-01', '2029-07-01')))
  })

  it('does not move at no growth, or for the same date', () => {
    const plan = samplePlan({ houseAppreciationRate: 0 })
    expect(rebaseline(plan, checkin(7_000_000, '2029-01-01'), I).patch.housePriceCents).toBe(30_000_000)
    expect(rebaseline(samplePlan(), checkin(7_000_000, '2026-01-01'), I).patch.housePriceCents).toBe(30_000_000)
  })
})

describe('rebaseline of a house already bought', () => {
  // Bought in year 2 for 300.000 at 3% a year, a 20% down payment and a 25-year loan at 3%.
  const owned = samplePlan({ housePurchaseYear: 2, mortgageTermYears: 25 })
  const date = '2029-01-01' // 1 year after the purchase on 1 January 2028

  /** The loan, month by month in euros of the day, as a bank would run it. */
  function bankBalance(loan: number, ratePerYear: number, months: number, elapsed: number): number {
    const r = ratePerYear / 12
    const payment = r === 0 ? loan / months : (loan * r) / (1 - (1 + r) ** -months)
    let balance = loan
    for (let m = 0; m < elapsed; m++) balance = balance * (1 + r) - payment
    return balance
  }

  it('is owned from the start, worth what it is worth today, with what is still owed as the loan', () => {
    const { patch } = rebaseline(owned, checkin(10_000_000, date), I)
    const value = Math.round(30_000_000 * 1.03 ** 3)
    expect(patch.housePurchaseYear).toBe(0)
    expect(patch.housePriceCents).toBe(value)
    // Price at purchase in the euros of 2026, then the loan in the euros paid on the day, then twelve payments.
    const priceAtPurchase = Math.round(30_000_000 * (1.03 / 1.02) ** 2)
    const loan = (priceAtPurchase - Math.round(priceAtPurchase * 0.2)) * g ** 2
    const owed = bankBalance(loan, 0.03, 300, 12)
    expect(patch.downPaymentFraction).toBeCloseTo(1 - owed / value, 6)
    expect(patch.housePriceCents * (1 - patch.downPaymentFraction)).toBeCloseTo(owed, -1)
  })

  it('has the term left, in years and fractions of one, so the loan is paid off the day it would have been', () => {
    const { patch } = rebaseline(owned, checkin(10_000_000, date), I)
    expect(patch.mortgageTermYears).toBe(24)
    const mid = rebaseline(owned, checkin(10_000_000, '2029-07-01'), I).patch
    expect(mid.mortgageTermYears).toBeCloseTo(25 - yearsBetween('2028-01-01', '2029-07-01'), 10)
    expect(Number.isInteger(mid.mortgageTermYears)).toBe(false)
  })

  it('keeps the payment the bank asks for, to the cent, however far into the loan it is', () => {
    const payment = (term: number, price: number, fraction: number, rate: number) => {
      const loan = price - Math.round(price * fraction)
      const r = rate / 12
      const n = term * 12
      return r === 0 ? loan / n : (loan * r) / (1 - (1 + r) ** -n)
    }
    const priceAtPurchase = Math.round(30_000_000 * (1.03 / 1.02) ** 2)
    const originalLoan = (priceAtPurchase - Math.round(priceAtPurchase * 0.2)) * g ** 2
    const original = payment(25, originalLoan, 0, 0.03)
    for (const when of ['2028-02-01', '2029-01-01', '2029-07-01', '2033-01-01', '2040-06-15']) {
      const { patch } = rebaseline(owned, checkin(10_000_000, when), I)
      const now = payment(patch.mortgageTermYears, patch.housePriceCents, patch.downPaymentFraction, 0.03)
      expect(Math.abs(now - original)).toBeLessThan(2)
    }
  })

  it('is the same for a loan at no interest', () => {
    const interestFree = samplePlan({ housePurchaseYear: 2, mortgageRateAnnual: 0, mortgageTermYears: 20 })
    const { patch } = rebaseline(interestFree, checkin(10_000_000, date), I)
    const priceAtPurchase = Math.round(30_000_000 * (1.03 / 1.02) ** 2)
    const loan = (priceAtPurchase - Math.round(priceAtPurchase * 0.2)) * g ** 2
    const owed = loan * (1 - 12 / 240)
    expect(patch.housePriceCents * (1 - patch.downPaymentFraction)).toBeCloseTo(owed, -1)
    expect(patch.mortgageTermYears).toBe(19)
  })

  it('has no loan left, and says so with a share of one, when the term has run out', () => {
    const { patch } = rebaseline(owned, checkin(10_000_000, '2060-01-01'), I)
    expect(patch.downPaymentFraction).toBe(1)
    expect(patch.mortgageTermYears).toBe(25)
  })

  it('treats a house owned from the first day the same way, from the plan start', () => {
    const fromDayOne = samplePlan({ housePurchaseYear: 0, mortgageTermYears: 25 })
    const { patch } = rebaseline(fromDayOne, checkin(10_000_000, date), I)
    expect(patch.housePurchaseYear).toBe(0)
    expect(patch.mortgageTermYears).toBeCloseTo(25 - 3, 10)
  })

  it('does not re-encode an owned house on the day the plan started, which would be rounding noise', () => {
    const fromDayOne = samplePlan({ housePurchaseYear: 0, downPaymentFraction: 0.2, housePriceCents: 33_333_333 })
    const { patch } = rebaseline(fromDayOne, checkin(10_000_000, '2026-01-01'), I)
    expect(patch.housePriceCents).toBe(33_333_333)
    expect(patch.downPaymentFraction).toBe(0.2)
    expect(patch.mortgageTermYears).toBe(25)
  })

  it('is stable: re-baselining an already owned house on the same date changes nothing', () => {
    const first = apply(owned, rebaseline(owned, checkin(10_000_000, date), I).patch)
    const second = rebaseline(first, checkin(10_000_000, date), I).patch
    for (const key of ['housePriceCents', 'downPaymentFraction', 'mortgageTermYears', 'housePurchaseYear'] as const) {
      expect(second[key]).toBe(first[key])
    }
  })

  it('stays owned when the date moves back, rather than turning into a purchase in year 1', () => {
    const fromDayOne = samplePlan({ housePurchaseYear: 0, planStartDate: '2027-01-01' })
    const { patch } = rebaseline(fromDayOne, checkin(10_000_000, '2026-06-01'), I)
    expect(patch.housePurchaseYear).toBe(0)
  })

  it('says what it assumed is still owed, so a house the plan only expected can be spotted', () => {
    const r = rebaseline(owned, checkin(10_000_000, date), I)
    expect(r.ownedHouse).toMatchObject({ valueCents: Math.round(30_000_000 * 1.03 ** 3), remainingYears: 24 })
    expect(r.ownedHouse!.owedCents).toBeGreaterThan(20_000_000)
    expect(rebaseline(samplePlan(), checkin(10_000_000, date), I).ownedHouse).toBeNull()
  })
})

describe('rebaseline leaves a house it cannot read alone', () => {
  it.each([
    ['no price', { housePurchaseYear: 2, housePriceCents: 0 }],
    ['no term', { housePurchaseYear: 2, mortgageTermYears: 0 }],
  ])('for %s', (_name, over) => {
    const plan = samplePlan(over)
    const { patch } = rebaseline(plan, checkin(10_000_000, '2029-01-01'), I)
    for (const key of ['housePriceCents', 'downPaymentFraction', 'mortgageTermYears'] as const) {
      expect(Number.isFinite(patch[key])).toBe(true)
    }
  })

  it('restates nothing from a start date that is not a date', () => {
    const plan = { ...samplePlan(), planStartDate: 'soon' }
    const { patch } = rebaseline(plan, checkin(10_000_000, '2029-01-01'), I)
    expect(Number.isFinite(patch.annualSpendCents)).toBe(true)
    expect(patch.annualSpendCents).toBe(3_000_000)
  })
})

describe('a plan restarted on its own path, at an anniversary, goes where it was going, in euros of the day', () => {
  function rng(seed: number) {
    let s = seed
    return () => {
      s = (s * 1664525 + 1013904223) % 4294967296
      return s / 4294967296
    }
  }

  /** The account, the house and the loan in euros of the day at each year of a plan, with `shift` years of inflation already behind its euros. */
  const nominal = (plan: GoalScenario, shift: number) =>
    projectNetWorth(scenarioToParams(plan, I)).map((p) => {
      const f = Math.pow(g, p.year + shift)
      return { invested: p.investedCents * f, house: p.houseEquityCents * f, loan: p.mortgageBalanceCents * f }
    })

  it('holds for random plans with a house, events and a change of the monthly amount, restarted 1 to 10 years in', () => {
    const rand = rng(41)
    let worst = 0
    for (let n = 0; n < 60; n++) {
      const purchase = [null, 0, 1, 3, 6, 9][Math.floor(rand() * 6)]!
      const plan = samplePlan({
        id: 1,
        horizonYears: 30,
        planStartDate: '2024-03-01',
        startInvestedCents: Math.round(2_000_000 + rand() * 30_000_000),
        monthlyContributionCents: Math.round(rand() * 250_000),
        expectedRealReturn: rand() * 0.08,
        housePurchaseYear: purchase,
        housePriceCents: Math.round(15_000_000 + rand() * 30_000_000),
        downPaymentFraction: 0.1 + rand() * 0.4,
        mortgageTermYears: 15 + Math.floor(rand() * 16),
        mortgageRateAnnual: rand() * 0.05,
        houseAppreciationRate: 0.01 + rand() * 0.04,
        lifeEvents: [{ year: 2 + Math.floor(rand() * 20), amountCents: Math.round((rand() - 0.4) * 5_000_000), label: 'Event' }],
        contributionSchedule: [{ from: '2033-05', monthlyCents: Math.round(rand() * 300_000) }],
      })
      const k = 1 + Math.floor(rand() * 10)
      const date = dateAtYears(plan.planStartDate!, k)
      const original = nominal(plan, 0)
      // The balance the plan itself has on that day, in euros of the day.
      const balance = Math.round(original[k]!.invested)
      const { patch } = rebaseline(plan, checkin(balance, date), I)
      // The restarted plan counts in the euros of its own start, so its years of inflation start from nothing.
      const restarted = nominal({ ...plan, ...patch }, 0)
      const steps = Math.min(restarted.length, original.length - k) - 1
      for (let t = 0; t <= steps; t++) {
        for (const key of ['invested', 'house', 'loan'] as const) {
          const was = original[k + t]![key]
          const now = restarted[t]![key]
          const scale = Math.max(1, Math.abs(original[k + t]!.invested), 5_000_000)
          worst = Math.max(worst, Math.abs(now - was) / scale)
          expect(Math.abs(now - was) / scale).toBeLessThan(2e-4)
        }
      }
    }
    expect(worst).toBeGreaterThanOrEqual(0)
  })
})

describe('makeScenario stays the sample for what it is not asked about', () => {
  it('has the shape rebaseline reads', () => {
    expect(makeScenario().mortgageTermYears).toBeGreaterThan(0)
  })
})

describe('what the re-baseline says it did to the amounts and the house', () => {
  it('says the amounts were counted in the euros of the new start, with what the biggest ones became', () => {
    const r = rebaseline(samplePlan({ housePurchaseYear: null }), checkin(7_000_000, '2029-01-01'), I)
    expect(say(r)).toContain(
      'After 3 years at 2,0% inflation, the amounts typed in the euros of the old start are counted in the euros of the new one: spending 30.000,00 € becomes 31.836,24 €, rent 1.000,00 € becomes 1.061,21 €, fees 6.000,00 € becomes 6.367,25 €, and event amounts the same way.',
    )
  })

  it('says a house price not yet reached grew by the house\u2019s own rate', () => {
    const r = rebaseline(samplePlan(), checkin(7_000_000, '2029-01-01'), I)
    expect(say(r)).toContain('The house price 300.000,00 € becomes 327.818,10 €: houses rose 3,0% a year over those 3 years.')
  })

  it('says a house already bought is held as owned, with what is assumed to be owed, and how to undo a purchase that has not happened', () => {
    const r = rebaseline(samplePlan({ housePurchaseYear: 2, mortgageTermYears: 25 }), checkin(10_000_000, '2029-01-01'), I)
    const text = say(r).join(' ')
    expect(text).toMatch(/The house purchase \(2028-01-01\) is behind the new start, so the plan holds the house as owned from day one: worth about 327\.818,10 €, with about [\d.]+,\d\d € still owed over 24 years \(the loan's own schedule, not a balance you logged\)\./)
    expect(text).toContain('If you have not bought it yet, cancel, move the purchase year, then re-baseline.')
  })

  it('does not tell someone whose house was owned from the first day that they might not have bought it', () => {
    const r = rebaseline(samplePlan({ housePurchaseYear: 0 }), checkin(10_000_000, '2029-01-01'), I)
    expect(say(r).join(' ')).toContain('The plan holds the house as owned from day one: worth about')
    expect(say(r).join(' ')).not.toContain('If you have not bought it yet')
  })

  it('says nothing about amounts that did not move: the same day, or no inflation', () => {
    expect(say(rebaseline(samplePlan({ housePurchaseYear: null, houseAppreciationRate: 0 }), checkin(7_000_000, '2026-01-01'), I))).toEqual([])
    expect(say(rebaseline(samplePlan({ housePurchaseYear: null, houseAppreciationRate: 0 }), checkin(7_000_000, '2029-01-01'), 0))).toEqual([])
  })
})
