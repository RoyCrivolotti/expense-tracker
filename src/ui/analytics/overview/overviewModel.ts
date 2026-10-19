/**
 * One assembly point for everything the Overview shows, so the view renders data
 * and the engine stays the only place that computes it.
 */
import type { ExpenseModel } from '../../useExpenseData'
import { sumsOf } from '../../buildExpenseModel'
import type {
  Allocation,
  AnalyticsBasis,
  FixedCostItem,
  AnalyticsPeriod,
  AnalyticsSignal,
  CompareMode,
  Mover,
  OverviewKpis,
  SpendingBaseline,
  SpendingPace,
} from '../../../engine'
import {
  classifierFromGroups,
  classifyFixedSpend,
  computeAllocation,
  computeCashReconciliation,
  computeMovers,
  computeOverviewKpis,
  computeSignals,
  computeSpendingBaseline,
  computeSpendingPace,
  detectedFixedCosts,
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
  /** What counts as fixed this month, for the reference list. */
  fixedCosts: FixedCostItem[]
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

/**
 * The totals, the baseline and the cash rows only add amounts, so they take the rows the model sums
 * (`sums`); everything that reads dates, descriptions or a series takes the real rows, with the series of
 * the whole history when the model holds only part of it (see docs/ENGINE-HISTORY.md).
 */
export function buildOverviewData(model: ExpenseModel, opts: OverviewOptions): OverviewData {
  const { dataset, months, history } = model
  const { transactions, categories, installmentPlans, goalScenarios } = dataset
  const summed = sumsOf(model).transactions
  const { month, period, compare, basis, today, openMonth } = opts
  const rolloverDay = dataset.settings.budgetRolloverDay

  const classifier = history ? classifierFromGroups(history.groups) : classifyFixedSpend(transactions)
  const kpis = computeOverviewKpis(summed, {
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
    ...(history ? { fixedGroups: history.groups } : {}),
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
    summed,
    dataset.accounts,
    dataset.settings,
    dataset.cashActuals,
  )
  const signals = computeSignals({ pace, movers, cashRows, openMonth })
  const unpaidByMonth = new Map(
    kpis.series.map((s) => [s.month, basis === 'committed' ? unpaidExpenseCents(summed, s.month) : 0]),
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
    baseline: computeSpendingBaseline(summed, installmentPlans, goalScenarios, {
      months,
      month,
      basis,
    }),
    unpaidByMonth,
    fixedCosts: detectedFixedCosts(transactions, installmentPlans, categories, month, history?.groups),
  }
}
