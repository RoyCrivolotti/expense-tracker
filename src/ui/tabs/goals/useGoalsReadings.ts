import { useMemo } from 'react'
import type { ExpenseModel } from '../../useExpenseData'
import { sumsOf } from '../../modelSums'
import {
  averageMonthlyCents,
  checkinInvestedCents,
  computeMonthlyTotals,
  latestCheckin,
  milestonesReached,
  monthlyFlows,
  planFromToday,
} from '../../../engine'
import type { InvestedSnapshot } from './checkinDate'
import { activePlan } from './scenarioSelection'

/** What the Goals tab reads off the data: milestones reached, the latest balance, the months, the plan and its restart. */
export function useGoalsReadings(model: ExpenseModel) {
  const { dataset } = model
  const milestones = dataset.settings.milestones
  const reachedMilestones = useMemo(
    () => milestonesReached(milestones, dataset.wealthCheckins, dataset.wealthAccounts),
    [milestones, dataset.wealthCheckins, dataset.wealthAccounts],
  )
  const latestSnapshot = useMemo<InvestedSnapshot | null>(() => {
    const latest = latestCheckin(dataset.wealthCheckins)
    if (!latest) return null
    return {
      investedCents: checkinInvestedCents(latest, dataset.wealthAccounts),
      date: latest.checkinDate,
    }
  }, [dataset.wealthCheckins, dataset.wealthAccounts])
  const sums = sumsOf(model)
  const monthly = useMemo(() => monthlyFlows(computeMonthlyTotals(sums.transactions)), [sums.transactions])
  const plan = useMemo(() => activePlan(dataset.goalScenarios), [dataset.goalScenarios])
  // The plan as it stands from the latest check-in: derived, never saved, and null until
  // there is a dated plan and a check-in to restart it from.
  const savedInflation = dataset.settings.assumedInflation
  const fromToday = useMemo(
    () => planFromToday(plan, latestSnapshot, savedInflation),
    [plan, latestSnapshot, savedInflation],
  )
  // Seeds a new draft's monthly contribution: what has actually gone into the
  // portfolio, not what was left over after expenses.
  const avgSaving = useMemo(() => averageMonthlyCents(monthly.map((m) => m.investedCents)), [monthly])
  return { milestones, reachedMilestones, latestSnapshot, sums, monthly, plan, fromToday, avgSaving }
}

export type GoalsReadings = ReturnType<typeof useGoalsReadings>
