import { onAxis, planFromTodayAt, projectNetWorth, scenarioToParams, type PlanFromToday } from '../../../../engine'

/**
 * The points of the plan-from-today line, for the plan's own axis. The restarted plan is in the euros
 * of the check-in's day, which are worth less than the euros the chart is drawn in (those of the plan
 * start) by the inflation between, so each value is brought back before it is drawn; the Nominal view
 * then inflates it once, from the start, and lands on the euros the account shows on each date. The
 * rate is the one the chart is projected at, which is a previewed one while it is previewed, and the
 * restart is counted at it too, so a preview of 6% draws what a saved 6% draws. A payment or event
 * steps the line on its anniversary: up to what the year made, then straight to what it left.
 */
export function fromTodayPoints(
  fromToday: PlanFromToday,
  inflationRate: number,
): { xIndex: number; value: number }[] {
  const at = planFromTodayAt(fromToday, inflationRate)
  return onAxis(projectNetWorth(scenarioToParams(at.scenario, inflationRate)), at.offsetYears, inflationRate)
}
