import { dateAtYears, yearOffsetFromDate } from '../../../engine'
import type { GoalScenario } from '../../../types'
import { formatCheckinDate } from './checkinDate'

/**
 * What the status row says when there is no ahead or behind to give. Three different reasons, and
 * pointing the reader at the wrong one sends them to fix something that is not broken: no plan
 * chosen, a plan with no start date, or a plan whose line does not reach the day of the latest
 * check-in (it starts after it, or ended before it).
 */
export function noStatusMessage(plan: GoalScenario | null, latestDate: string): string {
  if (!plan) return 'No plan chosen yet. Save a scenario on the Plan page (Scenarios on a phone) and choose Use as my plan.'
  const start = plan.planStartDate
  if (!start) {
    return `${plan.name} has no start date yet. Set one under Plan start, or re-baseline it from this check-in, to see whether you are ahead or behind.`
  }
  const offset = yearOffsetFromDate(start, latestDate)
  if (offset !== null && offset < 0) {
    return `${plan.name} starts on ${formatCheckinDate(start)}, after your latest check-in, so there is no plan line to compare it with yet.`
  }
  return `${plan.name} ends on ${formatCheckinDate(dateAtYears(start, plan.horizonYears))}, before your latest check-in, so there is no plan line to compare it with. Extend the horizon, or re-baseline from this check-in.`
}
