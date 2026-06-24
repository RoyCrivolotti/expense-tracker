import type { GoalScenario } from '../types'
import { SCENARIO_COLORS } from '../engine'
import seed from '../../fixtures/demo-goal-scenarios.json'

/** Three-path comparison set for README / docs screenshots (DOCS_CAPTURE only). */
export function docsCaptureGoalScenarios(): GoalScenario[] {
  return seed.scenarios.map((row, index) => ({
    id: index + 1,
    color: SCENARIO_COLORS[index % SCENARIO_COLORS.length] ?? '#6366f1',
    ...row,
  }))
}
