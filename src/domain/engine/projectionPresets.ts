import type { NewGoalScenario } from '../data/dataSource'
import { SCENARIO_COLORS } from './projectionConstants'

const colorAt = (index: number): string =>
  SCENARIO_COLORS[index % SCENARIO_COLORS.length] ?? '#6366f1'

export function duplicateScenario(
  scenario: NewGoalScenario,
  sortOrder: number,
): NewGoalScenario {
  return {
    ...scenario,
    name: `${scenario.name} (copy)`,
    sortOrder,
    color: colorAt(sortOrder),
  }
}
