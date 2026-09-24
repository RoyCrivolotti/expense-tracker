import type { ExpenseDataset } from '../../../types'
import type { NewGoalScenario } from '../../../data/dataSource'
import {
  DEFAULT_ANNUAL_SPEND_CENTS,
  DEFAULT_DOWN_PAYMENT_FRACTION,
  DEFAULT_HOUSE_APPRECIATION,
  DEFAULT_HORIZON_YEARS,
  DEFAULT_MORTGAGE_RATE,
  DEFAULT_MORTGAGE_TERM_YEARS,
  DEFAULT_REAL_RETURN,
  DEFAULT_RENT_MONTHLY_CENTS,
  DEFAULT_SWR,
  DEFAULT_TRANSACTION_COSTS_CENTS,
  checkinInvestedCents,
  latestCheckin,
  pickScenarioColor,
} from '../../../engine'
import { todayIso } from '../../components/transactionFormState'

export { duplicateScenario } from '../../../engine'

/**
 * A fresh draft starts where the owner actually is: the latest check-in's invested
 * total, dated the day it was taken, so the plan's start value and start date agree.
 * With no check-in yet it starts from zero today. The start balance is never taken
 * from a typed setting — that is how a plan came to start from a balance nobody had.
 */
export function draftFromDataset(
  dataset: ExpenseDataset,
  avgMonthlySavingCents: number,
): NewGoalScenario {
  const latest = latestCheckin(dataset.wealthCheckins)
  return {
    name: 'New plan',
    color: pickScenarioColor(dataset.goalScenarios.map((s) => s.color)),
    sortOrder: 0,
    startInvestedCents: latest ? checkinInvestedCents(latest, dataset.wealthAccounts) : 0,
    // A month of net withdrawals can leave the average below zero, which no plan can save.
    monthlyContributionCents: Math.max(0, avgMonthlySavingCents),
    annualContributionGrowth: 0,
    expectedRealReturn: DEFAULT_REAL_RETURN,
    horizonYears: DEFAULT_HORIZON_YEARS,
    housePriceCents: 0,
    downPaymentFraction: DEFAULT_DOWN_PAYMENT_FRACTION,
    housePurchaseYear: null,
    transactionCostsCents: DEFAULT_TRANSACTION_COSTS_CENTS,
    mortgageTermYears: DEFAULT_MORTGAGE_TERM_YEARS,
    mortgageRateAnnual: DEFAULT_MORTGAGE_RATE,
    houseAppreciationRate: DEFAULT_HOUSE_APPRECIATION,
    rentMonthlyCents: DEFAULT_RENT_MONTHLY_CENTS,
    annualSpendCents: DEFAULT_ANNUAL_SPEND_CENTS,
    safeWithdrawalRate: DEFAULT_SWR,
    planStartDate: latest?.checkinDate ?? todayIso(),
    lifeEvents: [],
  }
}
