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

/**
 * One- or two-line dashboard summary from a scenario's projection assumptions.
 * `actualMonthlyInvestingCents` is the pace actually kept (investment transactions
 * per month since the plan began), shown when it differs from what the plan assumes.
 */
export function scenarioHeadline(
  scenario: ScenarioLike,
  inflationRate: number,
  actualMonthlyInvestingCents?: number,
  format: MoneyFormat = EU_MONEY_FORMAT,
): ScenarioHeadline {
  const params = scenarioToParams('id' in scenario ? scenario : { ...scenario, id: 0 }, inflationRate)
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
    actualMonthlyInvestingCents != null &&
    actualMonthlyInvestingCents !== scenario.monthlyContributionCents
  ) {
    secondaryParts.push(`actual avg ${formatCents(actualMonthlyInvestingCents, format)}/mo invested`)
  }

  return { primary, secondary: secondaryParts.join(' · ') }
}
