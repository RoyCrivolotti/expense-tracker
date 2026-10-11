import { describe, expect, it } from 'vitest'
import {
  DEFAULT_HOUSE_APPRECIATION,
  DEFAULT_INFLATION_RATE,
  DEFAULT_MORTGAGE_RATE,
  DEFAULT_REAL_RETURN,
} from './projectionConstants'
import { pmt } from './finance'
import { housePriceAtPurchaseCents } from './housePrice'
import { monthlyMortgageCents, projectNetWorth, type ProjectionParams } from './projection'
import { paidShareOfYear, projectRentVsBuy, type RentVsBuyInput } from './rentVsBuy'

function baseParams(overrides: Partial<ProjectionParams> = {}): ProjectionParams {
  return {
    startInvestedCents: 5_000_000,
    monthlyContributionCents: 100_000,
    expectedRealReturn: DEFAULT_REAL_RETURN,
    horizonYears: 30,
    housePriceCents: 30_000_000,
    downPaymentFraction: 0.2,
    housePurchaseYear: null,
    transactionCostsCents: 600_000,
    mortgageTermYears: 25,
    mortgageRateAnnual: DEFAULT_MORTGAGE_RATE,
    houseAppreciationRate: DEFAULT_HOUSE_APPRECIATION,
    inflationRate: DEFAULT_INFLATION_RATE,
    ...overrides,
  }
}

const input = (overrides: Partial<RentVsBuyInput> = {}): RentVsBuyInput => ({
  params: baseParams(),
  rentMonthlyCents: 100_000,
  ...overrides,
})

/**
 * The comparison as it was before it began at the purchase year and carried its parts: the same loop,
 * kept here as the reference for what must not move.
 */
function before(i: RentVsBuyInput): { year: number; rent: number; buy: number }[] {
  const { params, rentMonthlyCents } = i
  const carryRate = i.carryRate ?? 0.015
  const buyNow: ProjectionParams = { ...params, housePurchaseYear: 0 }
  const yearPoints = projectNetWorth(buyNow)
  const r = params.expectedRealReturn
  const annualMortgage = monthlyMortgageCents(buyNow) * 12
  let rent = Math.round(params.housePriceCents * params.downPaymentFraction) + params.transactionCostsCents
  let buy = 0
  return yearPoints.map((point, t) => {
    if (t > 0) {
      rent = Math.round(rent * (1 + r))
      buy = Math.round(buy * (1 + r))
      const outlay =
        Math.round((annualMortgage * paidShareOfYear(t, params.mortgageTermYears)) / Math.pow(1 + params.inflationRate, t)) +
        Math.round(point.houseEquityCents * carryRate)
      const surplus = outlay - rentMonthlyCents * 12
      if (surplus > 0) rent += surplus
      else buy += -surplus
    }
    return { year: t, rent, buy: buy + point.houseEquityCents - point.mortgageBalanceCents }
  })
}

function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

function randomInput(rand: () => number, purchaseYear: number | null): RentVsBuyInput {
  return {
    params: baseParams({
      housePriceCents: Math.round(15_000_000 + rand() * 40_000_000),
      downPaymentFraction: 0.1 + rand() * 0.4,
      housePurchaseYear: purchaseYear,
      transactionCostsCents: Math.round(rand() * 2_000_000),
      mortgageTermYears: 10 + Math.floor(rand() * 21),
      mortgageRateAnnual: rand() * 0.06,
      houseAppreciationRate: rand() * 0.06,
      expectedRealReturn: rand() * 0.08,
      inflationRate: rand() * 0.04,
      horizonYears: 30,
    }),
    rentMonthlyCents: Math.round(60_000 + rand() * 200_000),
    carryRate: rand() * 0.04,
  }
}

describe('buying today is the comparison it always was', () => {
  it('has the same net worths, to the cent, for a house bought today or never', () => {
    const rand = rng(11)
    for (let n = 0; n < 40; n++) {
      const i = randomInput(rand, n % 2 === 0 ? null : 0)
      const was = before(i)
      const now = projectRentVsBuy(i).points
      const shared = Math.min(was.length, now.length)
      expect(shared).toBeGreaterThan(10)
      for (let t = 0; t < shared; t++) {
        expect(now[t]!.rentNetWorthCents).toBe(was[t]!.rent)
        expect(now[t]!.buyNetWorthCents).toBe(was[t]!.buy)
      }
    }
  })
})

describe('the comparison starts when the plan buys', () => {
  it('is the buy-today comparison at the price the house has risen to by the purchase year', () => {
    const params = baseParams({ housePurchaseYear: 8 })
    const risen = housePriceAtPurchaseCents(params)
    expect(risen).toBeGreaterThan(params.housePriceCents)
    const later = projectRentVsBuy({ params, rentMonthlyCents: 100_000 })
    const twin = projectRentVsBuy({ params: { ...params, housePurchaseYear: 0, housePriceCents: risen }, rentMonthlyCents: 100_000 })
    expect(later.points).toEqual(twin.points)
    expect(later.startYear).toBe(8)
    expect(twin.startYear).toBe(0)
  })

  it('starts the renter on the down payment and the fees at that price, and the buyer on the down payment', () => {
    const params = baseParams({ housePurchaseYear: 8 })
    const risen = housePriceAtPurchaseCents(params)
    const first = projectRentVsBuy({ params, rentMonthlyCents: 100_000 }).points[0]!
    const down = Math.round(risen * 0.2)
    expect(first.rentNetWorthCents).toBe(down + 600_000)
    expect(first.buyNetWorthCents).toBe(down)
  })

  it('says what the house costs on the day and the cash both sides start with', () => {
    const params = baseParams({ housePurchaseYear: 8 })
    const risen = housePriceAtPurchaseCents(params)
    const result = projectRentVsBuy({ params, rentMonthlyCents: 100_000 })
    expect(result.priceCents).toBe(risen)
    expect(result.upfrontCents).toBe(Math.round(risen * 0.2) + 600_000)
    expect(result.points[0]!.rentNetWorthCents).toBe(result.upfrontCents)
    expect(projectRentVsBuy(input()).priceCents).toBe(30_000_000)
  })

  it('keeps a house bought today, owned already or never planned at its year zero', () => {
    for (const year of [null, 0]) {
      expect(projectRentVsBuy({ params: baseParams({ housePurchaseYear: year }), rentMonthlyCents: 100_000 }).startYear).toBe(0)
    }
  })

  it('has no comparison without a house price', () => {
    const none = projectRentVsBuy(input({ params: baseParams({ housePriceCents: 0 }) }))
    expect(none.points).toEqual([])
    expect(none.verdict).toBeNull()
    expect(none.loanPaidOffYear).toBeNull()
    expect(none.ownCheaper).toBeNull()
  })
})

describe('it runs until ten years after the loan is paid off', () => {
  it.each([
    [25, 36],
    [24 + 7 / 12, 36],
    [30, 41],
    [15, 26],
  ])('for a term of %s years: %s points, years 0 to term + 10', (term, points) => {
    expect(projectRentVsBuy(input({ params: baseParams({ mortgageTermYears: term }) })).points).toHaveLength(points)
  })

  it('stops at sixty years however long the loan is', () => {
    expect(projectRentVsBuy(input({ params: baseParams({ mortgageTermYears: 100 }) })).points).toHaveLength(61)
  })

  it('does not depend on how long the plan runs', () => {
    const short = projectRentVsBuy(input({ params: baseParams({ horizonYears: 5 }) })).points
    const long = projectRentVsBuy(input({ params: baseParams({ horizonYears: 40 }) })).points
    expect(short).toEqual(long)
  })
})

describe('each side is split into what it holds', () => {
  const rand = rng(23)
  const cases = Array.from({ length: 30 }, (_, n) => randomInput(rand, [null, 0, 6][n % 3]!))

  it('adds the renter’s parts up to the renter’s money and the buyer’s up to the buyer’s', () => {
    for (const i of cases) {
      for (const p of projectRentVsBuy(i).points) {
        expect(p.rentSeedCents + p.rentExtraCents).toBe(p.rentNetWorthCents)
        expect(p.houseValueCents - p.loanLeftCents + p.buySavingsCents).toBe(p.buyNetWorthCents)
      }
    }
  })

  it('grows the cash the renter starts with at the real return, in closed form, and the rest is what was added', () => {
    for (const i of cases) {
      const { points } = projectRentVsBuy(i)
      const start = points[0]!.rentNetWorthCents
      points.forEach((p, t) => {
        expect(p.rentSeedCents).toBe(Math.round(start * Math.pow(1 + i.params.expectedRealReturn, t)))
      })
      expect(points[0]!.rentExtraCents).toBe(0)
    }
  })

  it('has the loan left at its start and none after the term, and the savings of the buyer at nothing at first', () => {
    const { points } = projectRentVsBuy(input())
    expect(points[0]!.loanLeftCents).toBe(24_000_000)
    expect(points[0]!.buySavingsCents).toBe(0)
    expect(points[25]!.loanLeftCents).toBe(0)
    expect(points[35]!.loanLeftCents).toBe(0)
  })
})

describe('both sides spend the same in total on housing and investing', () => {
  const rand = rng(31)
  const cases = Array.from({ length: 30 }, (_, n) => randomInput(rand, [null, 0, 6][n % 3]!))

  it('has one side paying and investing what the other pays, every month, to the cent', () => {
    for (const i of cases) {
      for (const p of projectRentVsBuy(i).points.slice(1)) {
        expect(Math.abs(p.rentHousingMonthlyCents + p.rentInvestsMonthlyCents - (p.buyHousingMonthlyCents + p.buyInvestsMonthlyCents))).toBeLessThanOrEqual(1)
      }
    }
  })

  it('has only the side that pays less investing, and nothing in the first year’s starting point', () => {
    for (const i of cases) {
      const points = projectRentVsBuy(i).points
      expect(points[0]!.rentInvestsMonthlyCents).toBe(0)
      expect(points[0]!.buyInvestsMonthlyCents).toBe(0)
      for (const p of points.slice(1)) {
        expect(p.rentInvestsMonthlyCents === 0 || p.buyInvestsMonthlyCents === 0).toBe(true)
        expect(p.rentHousingMonthlyCents).toBe(i.rentMonthlyCents)
      }
    }
  })

  it('has the renter invest the year’s surplus, which is what the year added to the renter’s money', () => {
    const i = input({ rentMonthlyCents: 10_000 })
    const { points } = projectRentVsBuy(i)
    const p1 = points[1]!
    const added = p1.rentNetWorthCents - Math.round(points[0]!.rentNetWorthCents * (1 + i.params.expectedRealReturn))
    expect(Math.abs(added - p1.rentInvestsMonthlyCents * 12)).toBeLessThanOrEqual(6)
  })
})

describe('with no growth, no inflation and no interest the gap is the fees and what keeping the house costs over the rent', () => {
  it('is the fees plus the upkeep less the rent, a year at a time', () => {
    const params = baseParams({
      expectedRealReturn: 0,
      inflationRate: 0,
      houseAppreciationRate: 0,
      mortgageRateAnnual: 0,
      mortgageTermYears: 20,
      housePriceCents: 24_000_000,
      downPaymentFraction: 0.25,
      transactionCostsCents: 800_000,
    })
    const rent = 90_000
    const carryRate = 0.01
    const { points } = projectRentVsBuy({ params, rentMonthlyCents: rent, carryRate })
    const upkeep = 24_000_000 * carryRate
    points.forEach((p, t) => {
      const gap = p.rentNetWorthCents - p.buyNetWorthCents
      expect(Math.abs(gap - (800_000 + t * (upkeep - rent * 12)))).toBeLessThanOrEqual(t + 1)
    })
  })
})

describe('what the loan does to a month', () => {
  const params = baseParams({ mortgageTermYears: 20 })
  const { points, loanPaidOffYear } = projectRentVsBuy(input({ params, rentMonthlyCents: 150_000 }))

  it('says the loan is paid off when its term is up', () => {
    expect(loanPaidOffYear).toBe(20)
  })

  it('takes the payment out of the buyer’s month the year it is paid off, which is when the buyer starts to invest more', () => {
    const lastFull = points[20]!
    const after = points[21]!
    const payment = monthlyMortgageCents({ ...params, housePurchaseYear: 0 })
    // The payment is fixed in the bank's euros, so in the plan's it is the first-year figure over the inflation since.
    expect(lastFull.buyHousingMonthlyCents - after.buyHousingMonthlyCents).toBeGreaterThan(0.8 * payment / Math.pow(1 + DEFAULT_INFLATION_RATE, 21))
    expect(after.buyInvestsMonthlyCents - lastFull.buyInvestsMonthlyCents).toBeGreaterThan(0.8 * payment / Math.pow(1 + DEFAULT_INFLATION_RATE, 21))
  })

  it('has no payment in the buyer’s month once it is paid, only the upkeep', () => {
    const after = points[25]!
    expect(after.buyHousingMonthlyCents).toBe(Math.round((after.houseValueCents * 0.015) / 12))
  })
})

describe('when owning gets cheaper than renting', () => {
  const rand = rng(47)
  const cases = Array.from({ length: 40 }, (_, n) => randomInput(rand, [null, 0, 5][n % 3]!))

  it('names the first year the buyer pays less than the renter, and whether that stays so', () => {
    for (const i of cases) {
      const result = projectRentVsBuy(i)
      const years = result.points.slice(1)
      const cheaper = (p: (typeof years)[number]) => p.buyHousingMonthlyCents < p.rentHousingMonthlyCents
      const first = years.find(cheaper)
      if (!first) {
        expect(result.ownCheaper).toBeNull()
        continue
      }
      expect(result.ownCheaper).toEqual({ fromYear: first.year, stays: years.filter((p) => p.year >= first.year).every(cheaper) })
    }
  })

  it('says it does not stay when keeping a house that rises faster than prices costs more than the rent again', () => {
    // The loan is paid off by year 12, the upkeep follows a house that rises 9% against 2% inflation, so it passes the rent again.
    const params = baseParams({
      housePriceCents: 30_000_000,
      mortgageTermYears: 12,
      houseAppreciationRate: 0.09,
      inflationRate: 0.02,
    })
    const result = projectRentVsBuy({ params, rentMonthlyCents: 150_000, carryRate: 0.02 })
    expect(result.ownCheaper).not.toBeNull()
    expect(result.ownCheaper!.stays).toBe(false)
  })

  it('has nothing to name when owning never costs less', () => {
    expect(projectRentVsBuy(input({ rentMonthlyCents: 1_000 })).ownCheaper).toBeNull()
  })
})

describe('the payment on the account', () => {
  it('is the bank’s, in the euros of the purchase day, which a house bought later makes larger', () => {
    const params = baseParams({ housePurchaseYear: 8 })
    const loan = (() => {
      const price = housePriceAtPurchaseCents(params)
      return price - Math.round(price * params.downPaymentFraction)
    })()
    const nominalLoan = loan * Math.pow(1 + DEFAULT_INFLATION_RATE, 8)
    const expected = pmt(params.mortgageRateAnnual / 12, params.mortgageTermYears * 12, nominalLoan)
    const got = projectRentVsBuy({ params, rentMonthlyCents: 100_000 }).paymentOnAccountCents
    expect(Math.abs(got - expected)).toBeLessThanOrEqual(2)
    const today = projectRentVsBuy({ params: baseParams({ housePurchaseYear: null }), rentMonthlyCents: 100_000 }).paymentOnAccountCents
    expect(got).toBeGreaterThan(today)
  })

  it('is nothing when there is no loan', () => {
    expect(projectRentVsBuy(input({ params: baseParams({ downPaymentFraction: 1 }) })).paymentOnAccountCents).toBe(0)
  })
})
