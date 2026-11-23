import { useMemo } from 'react'
import type { ExpenseDataset } from '../../types'
import {
  averageMonthlyCents,
  computeMonthlyTotals,
  defaultBudgetMonth,
  latestCheckin,
  checkinInvestedCents,
  planFromToday,
  monthlyFlows,
  paceMonths,
  plannedMonthlyAverage,
  trackStatus,
} from '../../engine'
import type { MoneyFormat } from '../../engine/money'
import { scenarioHeadline } from '../tabs/goals/scenarioHeadline'
import { activePlan } from '../tabs/goals/scenarioSelection'
import { todayIso } from './transactionFormState'

/** The active plan, the headline over it and the track status against the latest check-in. */
export function useGoalsCardFigures(
  dataset: ExpenseDataset,
  format: MoneyFormat,
  inflationRate: number,
) {
  const scenario = useMemo(() => activePlan(dataset.goalScenarios), [dataset.goalScenarios])
  // The pace kept since the plan began: investment transactions per month, which is
  // what the plan's monthly figure promises, rather than net saving.
  const { avgInvesting, plannedAverage } = useMemo(() => {
    const flows = monthlyFlows(computeMonthlyTotals(dataset.transactions))
    const { months } = paceMonths(
      flows,
      scenario?.planStartDate ?? null,
      defaultBudgetMonth(todayIso(), dataset.settings.budgetRolloverDay),
    )
    return {
      avgInvesting: averageMonthlyCents(months.map((m) => m.investedCents)),
      // What the plan averages over those same months, which is what the pace is set against.
      plannedAverage: scenario
        ? plannedMonthlyAverage(
            scenario,
            months.map((m) => m.month),
          )
        : 0,
    }
  }, [dataset.transactions, dataset.settings.budgetRolloverDay, scenario])
  const fromToday = useMemo(() => {
    const latest = latestCheckin(dataset.wealthCheckins)
    return planFromToday(
      scenario,
      latest ? { investedCents: checkinInvestedCents(latest, dataset.wealthAccounts), date: latest.checkinDate } : null,
      inflationRate,
    )
  }, [scenario, dataset.wealthCheckins, dataset.wealthAccounts, inflationRate])
  const headline = useMemo(
    () =>
      scenario
        ? scenarioHeadline(scenario, inflationRate, avgInvesting, format, fromToday, {
            today: todayIso(),
            plannedAverageCents: plannedAverage,
          })
        : null,
    [scenario, inflationRate, avgInvesting, plannedAverage, format, fromToday],
  )

  const track = useMemo(() => {
    if (!scenario) return null
    const latest = latestCheckin(dataset.wealthCheckins)
    if (!latest) return null
    return trackStatus(latest, scenario, dataset.wealthAccounts, inflationRate)
  }, [scenario, dataset.wealthCheckins, dataset.wealthAccounts, inflationRate])
  return { scenario, headline, track }
}
