import { useMemo } from 'react'
import type { GoalScenario } from '../../../types'
import type { NewGoalScenario } from '../../../data/dataSource'
import { restartFromLatest, type PlanFromToday } from '../../../engine'
import type { InvestedSnapshot } from './checkinDate'

/** What the Plan view draws and tabulates: the saved scenarios and the draft, as they are or restarted. */
export interface ShownScenarios {
  /** Whether they are restarted from the latest check-in. */
  restarted: boolean
  scenarios: GoalScenario[]
  /** The editor's deferred draft, which the charts read. */
  draft: NewGoalScenario
  /** The loaded scenario, whose start the check-in dots are placed against. */
  activeScenario: GoalScenario | null
  /**
   * The dotted plan-from-today line and its rows. Gone while restarted: every scenario is already
   * drawn from the check-in, so the plan would appear twice.
   */
  fromToday: PlanFromToday | null
  /** Names of the scenarios that kept their own start while the rest were restarted (see `ownsHouseFromStart`). */
  notRestarted: string[]
}

interface Input {
  on: boolean
  latest: InvestedSnapshot | null
  scenarios: GoalScenario[]
  draft: NewGoalScenario
  activeScenario: GoalScenario | null
  fromToday: PlanFromToday | null
}

/**
 * A scenario that buys the house at year 0 states its starting balance as what is left after
 * buying it ("capital already allocated"). The latest check-in is the balance before any such
 * purchase, so putting it in its place would count the money twice and draw the house for free:
 * "buy now" would come out the same as "never buy". Only the plan is exempt, since it is what the
 * check-ins measure and its balance already is the one after the purchase.
 */
function ownsHouseFromStart(s: Pick<NewGoalScenario, 'housePurchaseYear' | 'housePriceCents'>): boolean {
  return s.housePurchaseYear === 0 && s.housePriceCents > 0
}

/**
 * Every scenario, and the draft, as if it had started at the latest check-in (`restartFromLatest`).
 * A view of the saved ones and never a write: the editor keeps the raw draft, so what counts as
 * edited and what Save writes do not move when this is switched. Nothing is restarted without a
 * check-in, and with it off the inputs come back as they went in, so nothing downstream redraws.
 */
export function useStartFromToday({ on, latest, scenarios, draft, activeScenario, fromToday }: Input): ShownScenarios {
  return useMemo(() => {
    if (!on || !latest) return { restarted: false, scenarios, draft, activeScenario, fromToday, notRestarted: [] }
    const kept = new Set<string>()
    const restart = <T extends NewGoalScenario>(s: T, isPlan: boolean): T => {
      const restarted = restartFromLatest(s, latest)
      if (isPlan || !ownsHouseFromStart(restarted)) return restarted
      kept.add(s.name)
      return s
    }
    const shownScenarios = scenarios.map((s) => restart(s, s.isActive))
    const shownActive = activeScenario ? restart(activeScenario, activeScenario.isActive) : null
    return {
      restarted: true,
      scenarios: shownScenarios,
      draft: restart(draft, activeScenario?.isActive === true),
      activeScenario: shownActive,
      fromToday: null,
      notRestarted: [...kept],
    }
  }, [on, latest, scenarios, draft, activeScenario, fromToday])
}
