import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_HOUSE_APPRECIATION,
  DEFAULT_INFLATION_RATE,
  DEFAULT_MORTGAGE_RATE,
  DEFAULT_MORTGAGE_TERM_YEARS,
  DEFAULT_REAL_RETURN,
  DEFAULT_MILESTONE_CENTS,
  DEFAULT_TRANSACTION_COSTS_CENTS,
} from './projectionConstants'
import { projectNetWorthBand } from './scenarioProjection'
import {
  projectInvested,
  projectNetWorth,
  purchaseYearBreakdown,
  yearsToTarget,
  type ProjectionParams,
} from './projection'

function baseParams(overrides: Partial<ProjectionParams> = {}): ProjectionParams {
  return {
    startInvestedCents: 10_000_000,
    monthlyContributionCents: 100_000,
    annualContributionGrowth: 0,
    expectedRealReturn: DEFAULT_REAL_RETURN,
    horizonYears: 40,
    housePriceCents: 400_000_000,
    downPaymentFraction: 0.2,
    housePurchaseYear: null,
    transactionCostsCents: DEFAULT_TRANSACTION_COSTS_CENTS,
    mortgageTermYears: DEFAULT_MORTGAGE_TERM_YEARS,
    mortgageRateAnnual: DEFAULT_MORTGAGE_RATE,
    houseAppreciationRate: DEFAULT_HOUSE_APPRECIATION,
    inflationRate: DEFAULT_INFLATION_RATE,
    ...overrides,
  }
}

describe('projection invested milestones', () => {
  it('compound growth reaches €200k from €100k start with steady contributions', () => {
    const params = baseParams()
    const series = projectInvested(params)
    expect(series[0]).toBe(10_000_000)
    expect(yearsToTarget(series, 20_000_000)).toBeGreaterThan(0)
    expect(yearsToTarget(series, 20_000_000)).toBeLessThan(15)
  })

  it('house from day one tracks equity separately from invested balance', () => {
    const owned = projectNetWorth(
      baseParams({ startInvestedCents: 1_000_000, housePurchaseYear: 0 }),
    )
    expect(owned[5]!.houseEquityCents).toBeGreaterThan(0)
    expect(owned[5]!.netWorthCents).toBeGreaterThan(owned[5]!.investedCents)
  })

  it('house purchase at year 5 reduces invested vs a no-purchase path', () => {
    const shared = {
      startInvestedCents: 5_000_000,
      housePriceCents: 10_000_000,
      downPaymentFraction: 0.2,
      transactionCostsCents: 100_000,
      monthlyContributionCents: 10_000,
    }
    const withPurchase = projectInvested(baseParams({ ...shared, housePurchaseYear: 5 }))
    const without = projectInvested(baseParams({ ...shared, housePurchaseYear: null }))
    expect(withPurchase[5]).toBeLessThan(without[5]!)
  })

  it('purchaseYearBreakdown explains chart step vs full withdrawal', () => {
    const params = baseParams({
      startInvestedCents: 27_000_000,
      monthlyContributionCents: 100_000,
      expectedRealReturn: 0.05,
      horizonYears: 30,
      housePriceCents: 37_000_000,
      downPaymentFraction: 0.35,
      housePurchaseYear: 10,
      transactionCostsCents: 50_000,
      annualContributionGrowth: 0,
    })
    const breakdown = purchaseYearBreakdown(params, 10)
    expect(breakdown).not.toBeNull()
    expect(breakdown!.totalWithdrawalCents).toBe(12_950_000 + 50_000)
    expect(breakdown!.endInvestedCents).toBe(projectInvested(params)[10])
    expect(breakdown!.netChangeCents).toBe(
      breakdown!.endInvestedCents - breakdown!.startInvestedCents,
    )
    expect(Math.abs(breakdown!.netChangeCents)).toBeLessThan(breakdown!.totalWithdrawalCents)
  })

  it('maps milestone cents to year indices monotonically', () => {
    const series = projectInvested(baseParams())
    let prev = -1
    for (const m of DEFAULT_MILESTONE_CENTS) {
      const yr = yearsToTarget(series, m)
      if (yr === null) break
      expect(yr).toBeGreaterThan(prev)
      prev = yr
    }
  })
})

describe('annualSavingsFromCashflow', () => {
  it('derives savings from gross minus expenses', async () => {
    const { annualSavingsFromCashflow } = await import('./projection')
    const savings = annualSavingsFromCashflow(6_000_000, 200_000, 0.65, 0)
    const monthlyNet = Math.round((6_000_000 * 0.65) / 12)
    expect(savings).toBe((monthlyNet - 200_000) * 12)
  })
})

describe('fireNumber', () => {
  it('computes 25x at 4% SWR', async () => {
    const { fireNumber } = await import('./projection')
    expect(fireNumber(4_000_000, 0.04)).toBe(100_000_000)
  })
})

const frDir = process.env.FINANCIAL_REVIEW_DIR?.trim()
const hasFrParity =
  frDir &&
  existsSync(join(frDir, 'data/milestone_matrix.csv')) &&
  existsSync(join(frDir, 'config/goal-scenarios.seed.json'))

describe.skipIf(!hasFrParity)('workbook milestone parity (local only)', () => {
  it('matches milestone_matrix.csv for seeded paths', () => {
    const seed = JSON.parse(
      readFileSync(join(frDir!, 'config/goal-scenarios.seed.json'), 'utf8'),
    ) as { scenarios: Array<{
      name: string
      startInvestedCents: number
      monthlyContributionCents: number
      annualContributionGrowth: number
      expectedRealReturn: number
      housePriceCents: number
      downPaymentFraction: number
      housePurchaseYear: number | null
      transactionCostsCents: number
      mortgageTermYears: number
      mortgageRateAnnual: number
      houseAppreciationRate: number
    }> }

    const csv = readFileSync(join(frDir!, 'data/milestone_matrix.csv'), 'utf8').trim().split('\n')
    const headers = csv[0]!.split(',').slice(1)
    const milestones = headers.map((h) => Number(h.replace(/[^\d]/g, '')) * 1000 * 100)

    for (const row of csv.slice(1)) {
      const [pathName, ...years] = row.split(',')
      const scenario = seed.scenarios.find((s) => s.name === pathName)
      if (!scenario) continue
      const params: ProjectionParams = {
        startInvestedCents: scenario.startInvestedCents,
        monthlyContributionCents: scenario.monthlyContributionCents,
        annualContributionGrowth: scenario.annualContributionGrowth,
        expectedRealReturn: scenario.expectedRealReturn,
        horizonYears: 40,
        housePriceCents: scenario.housePriceCents,
        downPaymentFraction: scenario.downPaymentFraction,
        housePurchaseYear: scenario.housePurchaseYear,
        transactionCostsCents: scenario.transactionCostsCents,
        mortgageTermYears: scenario.mortgageTermYears,
        mortgageRateAnnual: scenario.mortgageRateAnnual,
        houseAppreciationRate: scenario.houseAppreciationRate,
        inflationRate: DEFAULT_INFLATION_RATE,
      }
      const series = projectInvested(params)
      milestones.forEach((m, i) => {
        const expected = years[i] === '40+' ? null : Number(years[i])
        expect(yearsToTarget(series, m)).toBe(expected)
      })
    }
  })
})

describe('life events', () => {
  it('adds a one-off inflow to the invested balance at the specified year', () => {
    const without = projectNetWorth(baseParams()).map((p) => p.investedCents)
    const withEvent = projectNetWorth(
      baseParams({ lifeEvents: [{ year: 5, amountCents: 10_000_000, label: 'Bonus' }] }),
    ).map((p) => p.investedCents)
    // Before year 5 the balances should be equal.
    expect(withEvent[4]).toBe(without[4])
    // At year 5 and beyond, withEvent should be higher by roughly the inflow * compounding.
    expect(withEvent[5]!).toBeGreaterThan(without[5]!)
    expect(withEvent[10]!).toBeGreaterThan(without[10]!)
  })

  it('subtracts a one-off outflow from the invested balance at the specified year', () => {
    const without = projectNetWorth(baseParams()).map((p) => p.investedCents)
    const withEvent = projectNetWorth(
      baseParams({ lifeEvents: [{ year: 5, amountCents: -5_000_000, label: 'Car' }] }),
    ).map((p) => p.investedCents)
    expect(withEvent[4]).toBe(without[4])
    expect(withEvent[5]!).toBeLessThan(without[5]!)
  })

  it('applies multiple life events in the same year correctly', () => {
    const withEvents = projectNetWorth(
      baseParams({
        lifeEvents: [
          { year: 3, amountCents: 10_000_000, label: 'Bonus' },
          { year: 3, amountCents: -3_000_000, label: 'Vacation' },
        ],
      }),
    ).map((p) => p.investedCents)
    const withNet = projectNetWorth(
      baseParams({ lifeEvents: [{ year: 3, amountCents: 7_000_000, label: 'Net' }] }),
    ).map((p) => p.investedCents)
    expect(withEvents[3]).toBe(withNet[3])
  })

  it('year 0 events are not applied (year 0 is the initial balance)', () => {
    const without = projectNetWorth(baseParams()).map((p) => p.investedCents)
    const withEvent = projectNetWorth(
      baseParams({ lifeEvents: [{ year: 0, amountCents: 99_000_000, label: 'Ignored' }] }),
    ).map((p) => p.investedCents)
    expect(withEvent[0]).toBe(without[0])
  })

  it('no-events case is unchanged from baseline', () => {
    const base = projectNetWorth(baseParams()).map((p) => p.investedCents)
    const empty = projectNetWorth(baseParams({ lifeEvents: [] })).map((p) => p.investedCents)
    expect(empty).toEqual(base)
  })
})

describe('the two figures GOALS-MODEL.md states', () => {
  /**
   * Both of these were written down wrong and stayed wrong, because nothing failed when
   * the doc and the code disagreed. These pin the code, so the next person to change
   * either one has to decide deliberately rather than leave the page stale.
   */
  const flat = {
    startInvestedCents: 0,
    monthlyContributionCents: 100_000,
    annualContributionGrowth: 0.1,
    expectedRealReturn: 0,
    horizonYears: 3,
    housePriceCents: 0,
    downPaymentFraction: 0,
    housePurchaseYear: null,
    transactionCostsCents: 0,
    mortgageTermYears: 30,
    mortgageRateAnnual: 0,
    houseAppreciationRate: 0,
    inflationRate: DEFAULT_INFLATION_RATE,
  }

  it('starts contribution growth in year 2, not year 1', () => {
    // Zero return, so each year's invested total is just the contributions so far.
    const points = projectNetWorth(flat)
    const yearly = 100_000 * 12

    // Year 1 is the amount entered, ungrown: (1 + g)^(y - 1), not (1 + g)^y.
    expect(points[1]?.investedCents).toBe(yearly)
    expect(points[2]?.investedCents).toBe(yearly + Math.round(yearly * 1.1))
    expect(points[3]?.investedCents).toBe(
      yearly + Math.round(yearly * 1.1) + Math.round(yearly * 1.1 * 1.1),
    )
  })

  it('spreads the uncertainty band 3 points either side by default', () => {
    const params = { ...flat, expectedRealReturn: 0.07, annualContributionGrowth: 0 }
    const { lo, hi } = projectNetWorthBand(params)

    expect(lo).toEqual(projectNetWorthBand(params, 0.03).lo)
    expect(hi).toEqual(projectNetWorthBand(params, 0.03).hi)
    expect(lo).not.toEqual(projectNetWorthBand(params, 0.02).lo)
  })
})

describe('the house and the mortgage in a real plan', () => {
  const price = 400_000_000
  const loan = price * 0.8

  it('grows the house only by what its appreciation beats inflation by', () => {
    // Appreciation equal to inflation is no growth in today's money at all.
    const flat = projectNetWorth(
      baseParams({ housePurchaseYear: 5, houseAppreciationRate: DEFAULT_INFLATION_RATE }),
    )
    expect(flat[5]!.houseEquityCents).toBe(price)
    expect(flat[25]!.houseEquityCents).toBe(price)

    // 2.5% against 2% inflation: ten years owned is (1.025 / 1.02) ten times over.
    const grown = projectNetWorth(baseParams({ housePurchaseYear: 5, houseAppreciationRate: 0.025 }))
    expect(grown[15]!.houseEquityCents).toBe(Math.round(price * (1.025 / 1.02) ** 10))
    // Nothing is owned before the purchase.
    expect(grown[4]!.houseEquityCents).toBe(0)
  })

  it('owes what the bank\'s schedule leaves, in today\'s money', () => {
    const rate = 0.03
    const months = 360
    const i = rate / 12
    const payment = (loan * i) / (1 - (1 + i) ** -months)
    const nominalBalance = (elapsed: number) => loan * (1 + i) ** elapsed - payment * (((1 + i) ** elapsed - 1) / i)

    const points = projectNetWorth(baseParams({ housePurchaseYear: 5, mortgageRateAnnual: rate, mortgageTermYears: 30 }))
    // Ten years in, the nominal balance, brought back ten years at the assumed inflation.
    const expected = nominalBalance(120) / (1 + DEFAULT_INFLATION_RATE) ** 10
    expect(Math.abs(points[15]!.mortgageBalanceCents - expected)).toBeLessThanOrEqual(2)
    // It is the full loan the day it is taken, and is paid off at the end of the term.
    expect(points[5]!.mortgageBalanceCents).toBe(loan)
    expect(projectNetWorth(baseParams({ housePurchaseYear: 0, mortgageTermYears: 30 }))[30]!.mortgageBalanceCents).toBe(0)
  })

  it('takes inflation off a loan with no interest too', () => {
    const points = projectNetWorth(baseParams({ housePurchaseYear: 0, mortgageRateAnnual: 0, mortgageTermYears: 20 }))
    // Half repaid after ten years, and what is left counted in today's money.
    expect(points[10]!.mortgageBalanceCents).toBe(Math.round((loan / 2) / (1 + DEFAULT_INFLATION_RATE) ** 10))
  })

  it('uses the inflation it is given, not a default', () => {
    const rate = 0.04
    const points = projectNetWorth(
      baseParams({ housePurchaseYear: 5, houseAppreciationRate: 0.025, inflationRate: rate }),
    )
    expect(points[15]!.houseEquityCents).toBe(Math.round(price * (1.025 / (1 + rate)) ** 10))

    const i = 0.03 / 12
    const payment = (loan * i) / (1 - (1 + i) ** -360)
    const nominal = loan * (1 + i) ** 120 - payment * (((1 + i) ** 120 - 1) / i)
    expect(Math.abs(points[15]!.mortgageBalanceCents - nominal / (1 + rate) ** 10)).toBeLessThanOrEqual(2)
    // More inflation is a smaller house and a smaller debt in today's money.
    const atTwo = projectNetWorth(baseParams({ housePurchaseYear: 5 }))
    expect(points[15]!.houseEquityCents).toBeLessThan(atTwo[15]!.houseEquityCents)
    expect(points[15]!.mortgageBalanceCents).toBeLessThan(atTwo[15]!.mortgageBalanceCents)
  })
})
