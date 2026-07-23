import type { GoalScenario } from '../../../types'
import type { NewGoalScenario } from '../../../data/dataSource'
import {
  EU_MONEY_FORMAT,
  formatCents,
  projectNetWorth,
  scenarioToParams,
  yearsToFi,
  type MoneyFormat,
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
  format: MoneyFormat = EU_MONEY_FORMAT,
): ScenarioHeadline {
  const params = scenarioToParams('id' in scenario ? scenario : { ...scenario, id: 0 })
  const series = projectNetWorth(params)
  const end = series[series.length - 1]
  const fiYear = yearsToFi(params, scenario.annualSpendCents, scenario.safeWithdrawalRate)

  const primaryParts = [shortName(scenario.name)]
  if (fiYear != null) primaryParts.push(`FI year ${fiYear}`)
  const primary = primaryParts.join(' · ')

  const secondaryParts = [
    `${formatCents(end?.netWorthCents ?? 0, format)} net worth @ ${scenario.horizonYears}y`,
    `plan ${formatCents(scenario.monthlyContributionCents, format)}/mo`,
  ]
  if (
    actualMonthlySavingCents != null &&
    actualMonthlySavingCents !== scenario.monthlyContributionCents
  ) {
    secondaryParts.push(`actual avg ${formatCents(actualMonthlySavingCents, format)}/mo`)
  }

  return { primary, secondary: secondaryParts.join(' · ') }
}
