import type { NewGoalScenario } from '../../../data/dataSource'
import { formatCents, shortMonthYearLabel, type MoneyFormat } from '../../../engine'

type Contributing = Pick<NewGoalScenario, 'monthlyContributionCents' | 'contributionSchedule'>

/**
 * What a scenario invests, in a sentence: the monthly amount, then each change to it with its
 * month. Exact, since 1,000 and 1,100 are different plans. "1.500,00 €/mo, then 2.500,00 €/mo
 * from Mar '28 and 0,00 €/mo from Jan '30".
 */
export function contributionPhrase(scenario: Contributing, format: MoneyFormat): string {
  const now = `${formatCents(scenario.monthlyContributionCents, format)}/mo`
  const changes = (scenario.contributionSchedule ?? []).map(
    (s) => `${formatCents(s.monthlyCents, format)}/mo from ${shortMonthYearLabel(s.from)}`,
  )
  if (changes.length === 0) return now
  const last = changes[changes.length - 1]!
  const head = changes.slice(0, -1)
  return `${now}, then ${head.length > 0 ? `${head.join(', ')} and ` : ''}${last}`
}

/**
 * A short note for the monthly input, which edits the starting amount only: "then 2.000,00 € from
 * Jun '27", and how many more follow. Null when the scenario never changes the amount.
 */
export function firstChangeNote(scenario: Pick<NewGoalScenario, 'contributionSchedule'>, format: MoneyFormat): string | null {
  const [first, ...rest] = scenario.contributionSchedule ?? []
  if (!first) return null
  const more = rest.length > 0 ? ` (+${rest.length} more)` : ''
  return `then ${formatCents(first.monthlyCents, format)} from ${shortMonthYearLabel(first.from)}${more}`
}
