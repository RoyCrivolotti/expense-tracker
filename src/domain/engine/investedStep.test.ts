import { describe, expect, it } from 'vitest'
import { annualContributionCents } from './contributionSchedule'
import { housePriceAtPurchaseCents } from './housePrice'
import { stepInvested, yearFlows } from './investedStep'
import { projectNetWorth, type ProjectionParams } from './projection'

function params(overrides: Partial<ProjectionParams> = {}): ProjectionParams {
  return {
    startInvestedCents: 5_000_000,
    monthlyContributionCents: 100_000,
    expectedRealReturn: 0.05,
    horizonYears: 30,
    housePriceCents: 30_000_000,
    downPaymentFraction: 0.2,
    housePurchaseYear: 8,
    transactionCostsCents: 600_000,
    mortgageTermYears: 25,
    mortgageRateAnnual: 0.03,
    houseAppreciationRate: 0.03,
    inflationRate: 0.02,
    ...overrides,
  }
}

/** The plan's yearly loop as it was written before the step was shared: the reference for what must not move. */
function before(p: ProjectionParams): { invested: number; pre: number }[] {
  let invested = p.startInvestedCents
  const out: { invested: number; pre: number }[] = []
  for (let year = 0; year <= p.horizonYears; year++) {
    let pre = invested
    if (year > 0) {
      invested = Math.round(invested * (1 + p.expectedRealReturn) + annualContributionCents(p.monthlyContributionCents, p.contributionSteps ?? [], year, p.inflationRate))
      pre = invested
      if (p.housePurchaseYear !== null && p.housePurchaseYear > 0 && year === p.housePurchaseYear) {
        invested -= Math.round(housePriceAtPurchaseCents(p) * p.downPaymentFraction) + p.transactionCostsCents
      }
      invested += (p.lifeEvents ?? []).filter((ev) => ev.year === year).reduce((sum, ev) => sum + ev.amountCents, 0)
    }
    out.push({ invested, pre })
  }
  return out
}

function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

describe('yearFlows', () => {
  it('has nothing to add or take in the first year, which has no year behind it', () => {
    expect(yearFlows(params(), 0)).toEqual({ contributionCents: 0, eventsCents: 0 })
  })

  it('is the year\'s saving in the plan\'s money, the same figure the schedule gives', () => {
    const p = params({ housePurchaseYear: null })
    for (const year of [1, 2, 10, 30]) {
      expect(yearFlows(p, year).contributionCents).toBe(annualContributionCents(p.monthlyContributionCents, [], year, p.inflationRate))
      expect(yearFlows(p, year).eventsCents).toBe(0)
    }
  })

  it('takes the down payment and the fees out in the purchase year, and only then', () => {
    const p = params()
    const down = Math.round(housePriceAtPurchaseCents(p) * 0.2)
    expect(yearFlows(p, 8).eventsCents).toBe(-(down + 600_000))
    expect(yearFlows(p, 7).eventsCents).toBe(0)
    expect(yearFlows(p, 9).eventsCents).toBe(0)
  })

  it('adds the life events of the year to the house, in either direction', () => {
    const p = params({ lifeEvents: [{ year: 8, amountCents: 1_000_000, label: 'Gift' }, { year: 8, amountCents: -250_000, label: 'Car' }, { year: 3, amountCents: 7, label: 'Other' }] })
    const down = Math.round(housePriceAtPurchaseCents(p) * 0.2)
    expect(yearFlows(p, 8).eventsCents).toBe(-(down + 600_000) + 1_000_000 - 250_000)
    expect(yearFlows(p, 3).eventsCents).toBe(7)
  })

  it('has no purchase for a house owned already or never planned', () => {
    expect(yearFlows(params({ housePurchaseYear: 0 }), 5).eventsCents).toBe(0)
    expect(yearFlows(params({ housePurchaseYear: null }), 8).eventsCents).toBe(0)
  })
})

describe('stepInvested', () => {
  it('grows the balance, adds the year\'s saving, and that is the value before the events; then the events', () => {
    const step = stepInvested(10_000_000, 1.05, { contributionCents: 1_200_000, eventsCents: -3_000_000 })
    expect(step.pre).toBe(Math.round(10_000_000 * 1.05 + 1_200_000))
    expect(step.post).toBe(step.pre - 3_000_000)
  })

  it('rounds once, to a cent, as the plan does', () => {
    expect(stepInvested(1_234_567, 1.0523, { contributionCents: 99_999, eventsCents: 0 }).pre).toBe(Math.round(1_234_567 * 1.0523 + 99_999))
  })

  it('does not floor a balance that goes negative', () => {
    expect(stepInvested(100_000, 1.05, { contributionCents: 0, eventsCents: -900_000 }).post).toBeLessThan(0)
  })
})

describe('the plan\'s projection with the shared step', () => {
  it('is what it was, to the cent, for random plans with houses, events, a changing monthly amount and any return', () => {
    const rand = rng(17)
    for (let n = 0; n < 150; n++) {
      const p = params({
        startInvestedCents: Math.round(rand() * 30_000_000) - 2_000_000,
        monthlyContributionCents: Math.round(rand() * 400_000),
        expectedRealReturn: rand() * 0.2 - 0.04,
        horizonYears: 1 + Math.floor(rand() * 45),
        housePurchaseYear: [null, 0, 1, 5, 12][Math.floor(rand() * 5)]!,
        housePriceCents: Math.round(10_000_000 + rand() * 40_000_000),
        inflationRate: rand() * 0.05,
        lifeEvents: rand() < 0.6 ? [{ year: 1 + Math.floor(rand() * 20), amountCents: Math.round((rand() - 0.5) * 8_000_000), label: 'Event' }] : [],
        contributionSteps: rand() < 0.5 ? [{ offsetYears: 3.5, monthlyCents: Math.round(rand() * 400_000) }] : [],
      })
      const was = before(p)
      const now = projectNetWorth(p)
      expect(now).toHaveLength(was.length)
      now.forEach((pt, t) => {
        expect(pt.investedCents).toBe(was[t]!.invested)
        expect(pt.preEventInvestedCents).toBe(was[t]!.pre)
      })
    }
  })
})
