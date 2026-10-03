import type { NewGoalScenario } from '../../../data/dataSource'
import type { Milestone } from '../../../types'
import {
  fireNumber,
  projectNetWorth,
  scenarioToParams,
  yearsToFi,
  yearsToTargetFromProjection,
} from '../../../engine'

export interface MilestoneStat {
  milestone: Milestone
  year: number | null
}

/**
 * The two milestones worth narrating: the next one the plan should cross, and
 * the top of the ladder. Collapses to one when the next milestone is the top.
 */
function narrativeMilestones(draft: NewGoalScenario, milestones: Milestone[], inflationRate: number) {
  const params = scenarioToParams({ ...draft, id: 0 }, inflationRate)
  const toStat = (milestone: Milestone): MilestoneStat => ({
    milestone,
    year: yearsToTargetFromProjection(params, milestone.amountCents, false),
  })
  const next = milestones.find((m) => m.amountCents > draft.startInvestedCents) ?? null
  const last = milestones[milestones.length - 1] ?? null
  const top = last && last.amountCents !== next?.amountCents ? last : null
  return { next: next ? toStat(next) : null, top: top ? toStat(top) : null }
}

/**
 * What a plan comes to, for the phone's summary box and the full narrative and, on a wide screen,
 * the line under the hero: where it ends, the year it reaches FI and the milestones worth saying.
 */
export function getNarrativeStats(draft: NewGoalScenario, milestones: Milestone[], inflationRate: number) {
  const params = scenarioToParams({ ...draft, id: 0 }, inflationRate)
  const series = projectNetWorth(params)
  const end = series[series.length - 1]
  const fiYear = yearsToFi(params, draft.annualSpendCents, draft.safeWithdrawalRate)
  const fiTarget = fireNumber(draft.annualSpendCents, draft.safeWithdrawalRate)
  return { end, fiYear, fiTarget, ...narrativeMilestones(draft, milestones, inflationRate) }
}
