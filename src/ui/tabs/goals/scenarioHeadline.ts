import type { GoalScenario } from '../../../types'
import type { NewGoalScenario } from '../../../data/dataSource'
import {
  formatCents,
  projectNetWorth,
  scenarioToParams,
  yearsToFi,
} from '../../../engine'

type ScenarioLike = GoalScenario | NewGoalScenario

export interface ScenarioHeadline {
  primary: string
  secondary: string
}

function shortName(name: string): string {
  const colon = name.indexOf(':')
  return colon >= 0 ? name.slice(0, colon).trim() : name
}

/** One- or two-line dashboard summary from a scenario's projection assumptions. */
export function scenarioHeadline(
  scenario: ScenarioLike,
  actualMonthlySavingCents?: number,
): ScenarioHeadline {
  const params = scenarioToParams('id' in scenario ? scenario : { ...scenario, id: 0 })
  const series = projectNetWorth(params)
  const end = series[series.length - 1]
  const fiYear = yearsToFi(params, scenario.annualSpendCents, scenario.safeWithdrawalRate)

  const primaryParts = [shortName(scenario.name)]
  if (fiYear != null) primaryParts.push(`FI year ${fiYear}`)
  const primary = primaryParts.join(' · ')

  const secondaryParts = [
    `${formatCents(end?.netWorthCents ?? 0)} net worth @ ${scenario.horizonYears}y`,
    `plan ${formatCents(scenario.monthlyContributionCents)}/mo`,
  ]
  if (
    actualMonthlySavingCents != null &&
    actualMonthlySavingCents !== scenario.monthlyContributionCents
  ) {
    secondaryParts.push(`actual avg ${formatCents(actualMonthlySavingCents)}/mo`)
  }

  return { primary, secondary: secondaryParts.join(' · ') }
}
