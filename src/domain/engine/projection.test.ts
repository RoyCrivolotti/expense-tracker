import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_HOUSE_APPRECIATION,
  DEFAULT_MORTGAGE_RATE,
  DEFAULT_MORTGAGE_TERM_YEARS,
  DEFAULT_REAL_RETURN,
  DEFAULT_TRANSACTION_COSTS_CENTS,
  MILESTONE_CENTS,
} from './projectionConstants'
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
    for (const m of MILESTONE_CENTS) {
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

describe.skipIf(!hasFrParity)('finance-review milestone parity (local only)', () => {
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
      }
      const series = projectInvested(params)
      milestones.forEach((m, i) => {
        const expected = years[i] === '40+' ? null : Number(years[i])
        expect(yearsToTarget(series, m)).toBe(expected)
      })
    }
  })
})
