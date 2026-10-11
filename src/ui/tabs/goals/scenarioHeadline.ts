import type { GoalScenario } from '../../../types'
import type { NewGoalScenario } from '../../../data/dataSource'
import {
  EU_MONEY_FORMAT,
  fiYearsExact,
  formatCents,
  nextContributionStep,
  plannedMonthlyAt,
  projectNetWorth,
  scenarioToParams,
  shortMonthYearLabel,
  yearsToFi,
  type MoneyFormat,
  type PlanFromToday,
} from '../../../engine'
import { fiAround } from './fiAround'
import { planMoneyLabel } from './planMoneyLabel'

type ScenarioLike = GoalScenario | NewGoalScenario

export interface ScenarioHeadline {
  primary: string
  secondary: string
}

function shortName(name: string): string {
  const colon = name.indexOf(':')
  return colon >= 0 ? name.slice(0, colon).trim() : name
}

/** The FI year counted from the latest check-in, which is the one that moves as check-ins land. */
function fiFromTodayLabel(fromToday: PlanFromToday, inflationRate: number, planReachesFi: boolean): string {
  const params = scenarioToParams(fromToday.scenario, inflationRate)
  const years = yearsToFi(params, fromToday.scenario.annualSpendCents, fromToday.scenario.safeWithdrawalRate)
  if (years === null) return 'from today, FI beyond the horizon'
  if (years === 0) return "FI at today's balance"
  const month = fiAround(fromToday.scenario.planStartDate, fiYearsExact(params, fromToday.scenario.annualSpendCents, fromToday.scenario.safeWithdrawalRate))
  // Said as a month, as the plan's is beside it, since the two counts of years start on different days.
  // The word FI comes from the plan's own part when it has one; with none, the restart's part has to say it.
  return month ? `from today, ${planReachesFi ? '' : 'FI '}${month}` : `from today, FI in ${years} year${years === 1 ? '' : 's'}`
}

/**
 * What the plan invests each month, for a plan that can change it: read on `today`, and set the
 * pace kept against what the plan averages over the months it was kept in.
 */
export interface HeadlinePace {
  today: string
  plannedAverageCents: number
}

/** "plan 1.000,00 €/mo", read on the date given, with the next change after it when there is one. */
function planPhrase(scenario: ScenarioLike, pace: HeadlinePace | null, format: MoneyFormat): string {
  if (!pace) return `plan ${formatCents(scenario.monthlyContributionCents, format)}/mo`
  const next = nextContributionStep(scenario, pace.today)
  const coming = next
    ? ` (${formatCents(next.monthlyCents, format)} from ${shortMonthYearLabel(next.from)})`
    : ''
  return `plan ${formatCents(plannedMonthlyAt(scenario, pace.today), format)}/mo${coming}`
}

/** The pace actually kept, when it is not what the plan averaged over those months; else null. */
function actualPhrase(
  scenario: ScenarioLike,
  actualCents: number | undefined,
  pace: HeadlinePace | null,
  format: MoneyFormat,
): string | null {
  if (actualCents == null) return null
  const planned = pace?.plannedAverageCents ?? scenario.monthlyContributionCents
  return actualCents === planned ? null : `actual avg ${formatCents(actualCents, format)}/mo invested`
}

/**
 * One- or two-line dashboard summary from a scenario's projection assumptions.
 * `actualMonthlyInvestingCents` is the pace actually kept (investment transactions
 * per month since the plan began), shown when it differs from what the plan assumes. Given a
 * `pace`, "plan" is the monthly amount in force today, with the next change after it when there is
 * one, and the comparison is with the plan's average over the same months.
 */
export function scenarioHeadline(
  scenario: ScenarioLike,
  inflationRate: number,
  actualMonthlyInvestingCents?: number,
  format: MoneyFormat = EU_MONEY_FORMAT,
  fromToday: PlanFromToday | null = null,
  pace: HeadlinePace | null = null,
): ScenarioHeadline {
  const params = scenarioToParams('id' in scenario ? scenario : { ...scenario, id: 0 }, inflationRate)
  const series = projectNetWorth(params)
  const end = series[series.length - 1]
  const fiYear = yearsToFi(params, scenario.annualSpendCents, scenario.safeWithdrawalRate)

  // With a restart from a check-in beside it, the plan's FI is a month too, so that the two can be compared.
  const planMonth = fromToday ? fiAround(scenario.planStartDate, fiYearsExact(params, scenario.annualSpendCents, scenario.safeWithdrawalRate)) : null
  const primary = [
    shortName(scenario.name),
    ...(fiYear != null ? [planMonth ? `FI ${planMonth}` : `FI year ${fiYear}`] : []),
    ...(fromToday ? [fiFromTodayLabel(fromToday, inflationRate, fiYear != null)] : []),
  ].join(' · ')

  const actual = actualPhrase(scenario, actualMonthlyInvestingCents, pace, format)
  const secondaryParts = [
    `${formatCents(end?.netWorthCents ?? 0, format)} net worth @ ${scenario.horizonYears}y in ${planMoneyLabel(scenario.planStartDate, format)}`,
    planPhrase(scenario, pace, format),
    ...(actual ? [actual] : []),
  ]

  return { primary, secondary: secondaryParts.join(' · ') }
}
