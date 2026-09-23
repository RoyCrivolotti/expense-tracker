import type { GoalScenario } from '../../../../types'
import type { NewGoalScenario } from '../../../../data/dataSource'
import { projectNetWorth, scenarioToParams, yearsToFi } from '../../../../engine'
import type { MoneyFormat } from '../../../../engine'
import { formatMoneyShort } from '../chartTheme'

function shortName(name: string): string {
  const colon = name.indexOf(':')
  return colon >= 0 ? name.slice(0, colon).trim() : name
}

export interface ComparisonRow {
  name: string
  color: string
  horizonYears: number
  fi: string
  netWorth: string
  invested: string
  house: string
  monthly: string
}

function houseLabel(year: number | null): string {
  if (year === null) return 'never'
  if (year === 0) return 'now'
  return `year ${year}`
}

function fiLabel(year: number | null): string {
  if (year === null) return 'not in horizon'
  if (year === 0) return 'now'
  return `year ${year}`
}

/** The numbers the charts make you hover for, one row per scenario and one for the draft. */
export function comparisonRows(
  scenarios: GoalScenario[],
  draft: NewGoalScenario,
  format: MoneyFormat,
): ComparisonRow[] {
  const all = [
    ...scenarios.map((s) => ({ name: shortName(s.name), color: s.color, scenario: s })),
    { name: `${shortName(draft.name)} (editing)`, color: draft.color, scenario: { ...draft, id: 0 } },
  ]
  return all.map(({ name, color, scenario }) => {
    const params = scenarioToParams(scenario)
    const points = projectNetWorth(params)
    const end = points[points.length - 1]
    return {
      name,
      color,
      horizonYears: end?.year ?? scenario.horizonYears,
      fi: fiLabel(yearsToFi(params, scenario.annualSpendCents, scenario.safeWithdrawalRate)),
      netWorth: end ? formatMoneyShort(end.netWorthCents, format) : '',
      invested: end ? formatMoneyShort(end.investedCents, format) : '',
      house: houseLabel(scenario.housePurchaseYear),
      monthly: formatMoneyShort(scenario.monthlyContributionCents, format),
    }
  })
}
