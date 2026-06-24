import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ANNUAL_CONTRIB_CENTS,
  DEFAULT_HOUSE_APPRECIATION,
  DEFAULT_MORTGAGE_RATE,
  DEFAULT_MORTGAGE_TERM_YEARS,
  DEFAULT_REAL_RETURN,
  DOWN_PAYMENT_FRACTION,
  DEFAULT_HOUSE_PRICE_CENTS,
  REMOVED_PATH_PRESETS,
  TRANSACTION_COSTS_CENTS,
} from './projectionConstants'
import {
  projectInvested,
  yearsToTarget,
  type ProjectionParams,
} from './projection'

function pathParams(
  startInvestedCents: number,
  housePurchaseYear: number | null,
): ProjectionParams {
  return {
    startInvestedCents,
    monthlyContributionCents: Math.round(DEFAULT_ANNUAL_CONTRIB_CENTS / 12),
    annualContributionGrowth: 0,
    expectedRealReturn: DEFAULT_REAL_RETURN,
    horizonYears: 40,
    housePriceCents: DEFAULT_HOUSE_PRICE_CENTS,
    downPaymentFraction: DOWN_PAYMENT_FRACTION,
    housePurchaseYear,
    transactionCostsCents: TRANSACTION_COSTS_CENTS,
    mortgageTermYears: DEFAULT_MORTGAGE_TERM_YEARS,
    mortgageRateAnnual: DEFAULT_MORTGAGE_RATE,
    houseAppreciationRate: DEFAULT_HOUSE_APPRECIATION,
  }
}

describe('projection invested milestones', () => {
  const matrix = {
    path2: [0, 0, 3, 7, 10, 16, 20],
    path3: [3, 11, 16, 20, 23, 29, 33],
    path4: [0, 0, 3, 15, 18, 24, 28],
  } as const

  const milestones = [
    10_000_000, 20_000_000, 30_000_000, 40_000_000, 50_000_000, 75_000_000, 100_000_000,
  ]

  it('matches finance-review milestone_matrix.csv for Path 2', () => {
    const params = pathParams(REMOVED_PATH_PRESETS.path2.startInvestedCents, null)
    const series = projectInvested(params)
    milestones.forEach((m, i) => {
      expect(yearsToTarget(series, m)).toBe(matrix.path2[i])
    })
  })

  it('matches finance-review milestone_matrix.csv for Path 3', () => {
    const params = pathParams(REMOVED_PATH_PRESETS.path3.startInvestedCents, 0)
    const series = projectInvested(params)
    milestones.forEach((m, i) => {
      expect(yearsToTarget(series, m)).toBe(matrix.path3[i])
    })
  })

  it('matches finance-review milestone_matrix.csv for Path 4', () => {
    const params = pathParams(REMOVED_PATH_PRESETS.path4.startInvestedCents, 5)
    const series = projectInvested(params)
    milestones.forEach((m, i) => {
      expect(yearsToTarget(series, m)).toBe(matrix.path4[i])
    })
  })
})

describe('annualSavingsFromCashflow', () => {
  it('derives realistic tier from €75,960 gross', async () => {
    const { annualSavingsFromCashflow } = await import('./projection')
    const savings = annualSavingsFromCashflow(7_596_000, 475_000)
    expect(savings).toBeGreaterThanOrEqual(600_000 - 5000)
    expect(savings).toBeLessThanOrEqual(600_000 + 5000)
  })
})

describe('fireNumber', () => {
  it('computes 25x at 4% SWR', async () => {
    const { fireNumber } = await import('./projection')
    expect(fireNumber(4_000_000, 0.04)).toBe(100_000_000)
  })
})
