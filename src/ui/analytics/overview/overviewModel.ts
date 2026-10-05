/**
 * One assembly point for everything the Overview shows, so the view renders data
 * and the engine stays the only place that computes it.
 */
import type { ExpenseModel } from '../../useExpenseData'
import type {
  Allocation,
  AnalyticsBasis,
  AnalyticsPeriod,
  AnalyticsSignal,
  CompareMode,
  Mover,
  OverviewKpis,
  SpendingBaseline,
  SpendingPace,
} from '../../../engine'
import {
  classifyFixedSpend,
  computeAllocation,
  computeCashReconciliation,
  computeMovers,
  computeOverviewKpis,
  computeSignals,
  computeSpendingBaseline,
  computeSpendingPace,
  priorBudgetMonth,
  sameDaysCut,
  unpaidExpenseCents,
} from '../../../engine'

export interface OverviewData {
  kpis: OverviewKpis
  pace: SpendingPace
  allocation: Allocation
  movers: Mover[]
  signals: AnalyticsSignal[]
  baseline: SpendingBaseline | null
  /** Unpaid card cents per spark month, for the trend's hatched caps. */
  unpaidByMonth: Map<string, number>
}

export interface OverviewOptions {
  month: string
  period: AnalyticsPeriod
  compare: CompareMode
  basis: AnalyticsBasis
  today: string
  /** The budget month `today` falls in (rollover-aware). */
  openMonth: string
}

export function buildOverviewData(model: ExpenseModel, opts: OverviewOptions): OverviewData {
  const { dataset, months } = model
  const { transactions, categories, installmentPlans, goalScenarios } = dataset
  const { month, period, compare, basis, today, openMonth } = opts
  const rolloverDay = dataset.settings.budgetRolloverDay

  const classifier = classifyFixedSpend(transactions)
  const kpis = computeOverviewKpis(transactions, {
    months,
    month,
    period,
    compare,
    basis,
    today,
    openMonth,
    rolloverDay,
  })
  const pace = computeSpendingPace(transactions, categories, installmentPlans, classifier, {
    month,
    today,
    openMonth,
    rolloverDay,
    basis,
    prevMonth: months.includes(priorBudgetMonth(month)) ? priorBudgetMonth(month) : null,
  })
  const movers = computeMovers(transactions, categories, classifier, {
    months,
    month,
    basis,
    today,
    openMonth,
    rolloverDay,
  })
  const cashRows = computeCashReconciliation(
    transactions,
    dataset.accounts,
    dataset.settings,
    dataset.cashActuals,
  )
  const signals = computeSignals({ pace, movers, cashRows, openMonth })
  const unpaidByMonth = new Map(
    kpis.series.map((s) => [s.month, basis === 'committed' ? unpaidExpenseCents(transactions, s.month) : 0]),
  )
  return {
    kpis,
    pace,
    allocation: computeAllocation(
      transactions,
      classifier,
      month,
      basis,
      sameDaysCut(month, today, openMonth, rolloverDay),
    ),
    movers,
    signals,
    baseline: computeSpendingBaseline(transactions, installmentPlans, goalScenarios, {
      months,
      month,
      basis,
    }),
    unpaidByMonth,
  }
}
