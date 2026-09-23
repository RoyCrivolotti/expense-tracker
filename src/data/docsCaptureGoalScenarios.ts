import type { GoalScenario } from '../types'
import { SCENARIO_COLORS, shiftBudgetMonth } from '../engine'
import { todayIso } from '../ui/components/transactionFormState'
import seed from '../../fixtures/demo-goal-scenarios.json'

/** Three-path comparison set for README / docs screenshots (DOCS_CAPTURE only). */
export function docsCaptureGoalScenarios(): GoalScenario[] {
  // Half a year in, so the Progress chart has a plan line to draw check-ins against.
  const planStartDate = `${shiftBudgetMonth(todayIso().slice(0, 7), -6)}-01`
  return seed.scenarios.map((row, index) => ({
    id: index + 1,
    color: SCENARIO_COLORS[index % SCENARIO_COLORS.length] ?? '#6366f1',
    planStartDate,
    lifeEvents: [],
    // The first path is the plan, so the gallery shows a Progress view with a status.
    isActive: index === 0,
    ...row,
  }))
}
