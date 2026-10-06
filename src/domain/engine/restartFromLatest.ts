import { rebaseline, type Rebaselinable } from './rebaselinePatch'

/**
 * A scenario as if it had started at the latest check-in: the same assumptions, projected from
 * the balance actually there, with life events and the house purchase kept on their calendar
 * dates. It is what `rebaseline` would write, applied to the copy and never saved, so it works
 * for a saved scenario and for the editor's draft alike and cannot go stale at the next check-in.
 *
 * A scenario that starts after the check-in is left as it is: it has not begun, so there is
 * nothing to restart (`planFromToday` draws the same line). One with no start date is restarted,
 * since the charts already read it as starting today.
 */
export function restartFromLatest<T extends Rebaselinable>(
  scenario: T,
  latest: { investedCents: number; date: string } | null,
): T {
  if (!latest) return scenario
  if (scenario.planStartDate && scenario.planStartDate > latest.date) return scenario
  return { ...scenario, ...rebaseline(scenario, latest).patch }
}
