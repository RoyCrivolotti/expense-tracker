import type { GoalScenario } from '../../../../types'
import type { NewGoalScenario } from '../../../../data/dataSource'
import { fiYearsExact, formatCents, projectNetWorth, scenarioToParams, yearsToFi } from '../../../../engine'
import { fiAround } from '../fiAround'
import type { MoneyFormat, PlanFromToday } from '../../../../engine'
import { formatMoneyShort } from '../chartTheme'
import { tableName } from '../scenarioNames'

export interface ComparisonRow {
  /** Stable across renames and shared short names: the scenario id, or 'draft'. */
  key: string
  name: string
  color: string
  horizonYears: number
  /** The plan year net worth and invested are read at: the one asked for, or the horizon when shorter. */
  atYear: number
  fi: string
  netWorth: string
  invested: string
  house: string
  monthly: string
  /** What the monthly amount comes to after the last change to it, or null when it never changes. */
  monthlyLater: string | null
}

/** What the scenario invests after the last change to the monthly amount; null when it never changes. */
function laterMonthly(
  scenario: Pick<NewGoalScenario, 'contributionSchedule'>,
  format: MoneyFormat,
): string | null {
  const last = scenario.contributionSchedule?.[scenario.contributionSchedule.length - 1]
  return last ? formatCents(last.monthlyCents, format) : null
}

function houseLabel(year: number | null): string {
  if (year === null) return 'never'
  if (year === 0) return 'owned'
  return `year ${year}`
}

/**
 * FI for a row: the years from its own plan start, or, for a plan and its restart from a check-in (whose years are
 * counted from two different days), the month it is reached in, so the two can be read against each other.
 */
function fiCell(params: ReturnType<typeof scenarioToParams>, scenario: { annualSpendCents: number; safeWithdrawalRate: number; planStartDate: string | null }, asMonth: boolean): string {
  const year = yearsToFi(params, scenario.annualSpendCents, scenario.safeWithdrawalRate)
  const month = asMonth ? fiAround(scenario.planStartDate, fiYearsExact(params, scenario.annualSpendCents, scenario.safeWithdrawalRate)) : null
  return month ?? fiLabel(year)
}

function fiLabel(year: number | null): string {
  if (year === null) return 'not in horizon'
  if (year === 0) return 'now'
  return `year ${year}`
}

/**
 * The numbers the charts make you hover for, one row per scenario, plus one for the draft
 * when it is a line of its own. A loaded scenario with no edits is drawn as the draft on
 * the chart, so a row for both would be the same plan twice. Net worth and invested are
 * read at `year`, or at each path's horizon when null or when the horizon is shorter.
 */
export function comparisonRows(
  scenarios: GoalScenario[],
  draft: NewGoalScenario,
  format: MoneyFormat,
  inflationRate: number,
  includeDraft = true,
  year: number | null = null,
  fromToday: PlanFromToday | null = null,
): ComparisonRow[] {
  const names = scenarios.map((s) => s.name)
  const all: { key: string; name: string; color: string; scenario: GoalScenario | (NewGoalScenario & { id: number }) }[] = scenarios.flatMap((s) => [
    { key: `saved-${s.id}`, name: tableName(s.name, names), color: s.color, scenario: s },
    // The plan restarted from the latest check-in sits under the plan, in its colour; its
    // years count from the check-in, which the table's hint says.
    ...(fromToday && s.id === fromToday.scenario.id
      ? [{ key: 'from-today', name: `${tableName(s.name, names)}, from today`, color: s.color, scenario: fromToday.scenario }]
      : []),
  ])
  if (includeDraft) {
    all.push({ key: 'draft', name: `${tableName(draft.name, names)} (editing)`, color: draft.color, scenario: { ...draft, id: 0 } })
  }
  return all.map(({ key, name, color, scenario }) => {
    const params = scenarioToParams(scenario, inflationRate)
    const points = projectNetWorth(params)
    const last = points[points.length - 1]
    const atYear = year === null ? (last?.year ?? scenario.horizonYears) : Math.min(year, scenario.horizonYears)
    const end = points.find((p) => p.year === atYear) ?? last
    return {
      key,
      name,
      color,
      horizonYears: last?.year ?? scenario.horizonYears,
      atYear,
      fi: fiCell(params, scenario, key === 'from-today' || (fromToday !== null && scenario.id === fromToday.scenario.id && key !== 'draft')),
      netWorth: end ? formatMoneyShort(end.netWorthCents, format) : '',
      invested: end ? formatMoneyShort(end.investedCents, format) : '',
      house: houseLabel(scenario.housePurchaseYear),
      // Exact: 1,000, 1,400 and 1,499 a month are three different plans, not "1k".
      monthly: formatCents(scenario.monthlyContributionCents, format),
      monthlyLater: laterMonthly(scenario, format),
    }
  })
}
