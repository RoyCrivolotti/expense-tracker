import { describe, expect, it } from 'vitest'
import type { GoalScenario, InstallmentPlan, Transaction } from '../types'
import { computeSpendingBaseline } from './spendingBaseline'

function txn(partial: Partial<Transaction>): Transaction {
  return {
    id: Math.random(),
    date: '2026-01-05',
    budgetMonth: '2026-01',
    description: 'x',
    accountId: 1,
    categoryId: 1,
    type: 'expense',
    amountCents: 1000,
    cancelled: false,
    status: 'posted',
    ...partial,
  }
}

const scenario = { id: 1, isActive: true, annualSpendCents: 3_000_000 } as GoalScenario

const endingPlan: InstallmentPlan = {
  id: 1,
  description: 'Phone',
  totalCount: 24,
  amountCents: 4000,
  accountId: 1,
  categoryId: 1,
  type: 'expense',
  anchorBudgetMonth: '2024-06', // final instalment 2026-05, within a year of the view
  startInstallmentIndex: 1,
  active: true,
}

const MONTHS = ['2025-12', '2026-01', '2026-02', '2026-03']
const TXNS = [
  txn({ date: '2025-12-05', budgetMonth: '2025-12', amountCents: 200000 }),
  txn({ date: '2026-01-05', budgetMonth: '2026-01', amountCents: 250000 }),
  txn({ date: '2026-02-05', budgetMonth: '2026-02', amountCents: 300000 }),
  // March is the month being viewed, so it stays out of the baseline.
  txn({ date: '2026-03-05', budgetMonth: '2026-03', amountCents: 999999 }),
]

describe('computeSpendingBaseline', () => {
  it('measures the trailing closed months: total, mean, median', () => {
    const b = computeSpendingBaseline(TXNS, [], [scenario], {
      months: MONTHS,
      month: '2026-03',
      basis: 'committed',
    })!
    expect(b.months).toEqual(['2025-12', '2026-01', '2026-02'])
    expect(b.totalCents).toBe(750000)
    expect(b.meanMonthlyCents).toBe(250000)
    expect(b.medianMonthlyCents).toBe(250000)
  })

  it('reads the plan from the active scenario and reports the gap', () => {
    const b = computeSpendingBaseline(TXNS, [], [scenario], {
      months: MONTHS,
      month: '2026-03',
      basis: 'committed',
    })!
    expect(b.planMonthlyCents).toBe(250000)
    expect(b.deltaVsPlanCents).toBe(0)
  })

  it('drops instalments that end within the year from the run-rate', () => {
    const b = computeSpendingBaseline(TXNS, [endingPlan], [], {
      months: MONTHS,
      month: '2026-03',
      basis: 'committed',
    })!
    expect(b.runRateAfterInstallmentsCents).toBe(250000 - 4000)
    expect(b.planMonthlyCents).toBeNull()
    expect(b.deltaVsPlanCents).toBeNull()
  })

  it('subtracts nothing for a plan that has not started yet', () => {
    // Starts in April and ends within the year, but it contributed nothing to
    // the measured months, so there is nothing of it to fall away.
    const notStarted = { ...endingPlan, anchorBudgetMonth: '2026-04', totalCount: 3 }
    const b = computeSpendingBaseline(TXNS, [notStarted], [], {
      months: MONTHS,
      month: '2026-03',
      basis: 'committed',
    })!
    expect(b.runRateAfterInstallmentsCents).toBe(250000)
  })

  it('is null with no closed month to measure', () => {
    const b = computeSpendingBaseline([], [], [], {
      months: ['2026-03'],
      month: '2026-03',
      basis: 'committed',
    })
    expect(b).toBeNull()
  })
})
