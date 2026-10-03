import type { GoalScenario } from '../../../types'

/** What the delete question says is lost, and what that does to Progress when it is the plan. */
export function deleteMessage(scenario: GoalScenario): string[] {
  const lines = ['Its projection line goes with it. Check-ins and your other scenarios stay.']
  if (scenario.isActive) {
    lines.push('It is your current plan, so Progress has nothing to measure against until you pick another.')
  }
  return lines
}
