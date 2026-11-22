import type { PlanFromToday } from '../../../engine'

/** The plan carried on from the latest check-in, when the plan is not the scenario loaded in the editor; else null. */
export function otherPlanOf(
  fromToday: PlanFromToday | null,
  loadedId: number | null,
): PlanFromToday | null {
  return fromToday && fromToday.source.plan.id !== loadedId ? fromToday : null
}
