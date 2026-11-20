import type { NewGoalScenario } from '../../../../data/dataSource'
import { currencyWord, dateAtYears, type MoneyFormat, type PlanFromToday } from '../../../../engine'
import { formatCheckinDate } from '../checkinDate'
import { planMoneyLabel } from '../planMoneyLabel'
import { monthOf } from './comparisonCalendar'
import type { ComparisonRow } from './comparisonRows'

/** Where net worth and invested are read, for the hint. */
function readAt(rows: ComparisonRow[], year: number | null): string {
  const shared = rows.every((r) => r.atYear === rows[0]?.atYear)
  if (shared && rows[0]) return ` after ${rows[0].atYear} years`
  return year === null ? ' at each path’s horizon' : ` after ${year} years, or at a path’s horizon when it is shorter`
}

/**
 * The euros the figures are in: the plan's when every row starts in the same year, and the euros of each plan's
 * own start when they do not, as each plan counts in its own.
 */
function figuresMoney(starts: readonly (string | null)[], format: MoneyFormat): string {
  const labels = new Set(starts.map((start) => planMoneyLabel(start, format)))
  const [only] = labels
  return labels.size === 1 && only !== undefined ? `in ${only}` : `each in the ${currencyWord(format)} of its own start date`
}

export interface HintInput {
  rows: ComparisonRow[]
  scenarios: readonly Pick<NewGoalScenario, 'planStartDate' | 'housePurchaseYear'>[]
  draft: Pick<NewGoalScenario, 'planStartDate' | 'housePurchaseYear'>
  includeDraft: boolean
  /** The window chosen, in years; null for the horizon. */
  year: number | null
  fromToday: PlanFromToday | null
  format: MoneyFormat
}

function monthlyPart(rows: ComparisonRow[]): string {
  return `monthly is what each path invests${rows.some((r) => r.monthlyLater) ? ', and what a change to it comes to' : ''}.`
}

/** The hint when every scenario starts on one day: each row at its own plan year, as the table always read. */
export function sameDayHint({ rows, scenarios, draft, includeDraft, year, fromToday, format }: HintInput): string {
  const starts = [...scenarios.map((s) => s.planStartDate), ...(includeDraft ? [draft.planStartDate] : [])]
  const restart = fromToday
    ? ` "From today" is your plan restarted from the balance in your latest check-in, ${formatCheckinDate(fromToday.since)}, and counts its years and its ${currencyWord(format)} from there (${planMoneyLabel(fromToday.scenario.planStartDate, format)}). FI is given as a month for the plan and its restart, since their years are counted from different days.`
    : ''
  return `Net worth and invested are${readAt(rows, year)}, ${figuresMoney(starts, format)}; FI and the house purchase are counted in years from the plan start; ${monthlyPart(rows)}${restart}`
}

/** The hint when scenarios start on different days and every row is read on one calendar. */
export function calendarHint({ rows, year, fromToday, format }: HintInput, origin: string): string {
  const atYear = rows[0]?.atYear ?? 0
  const rest = rows[0]?.everyReaches === false ? ', the last year shown' : ', the last year every scenario reaches'
  const when = `${monthOf(dateAtYears(origin, atYear))}${year === null ? rest : ''}`
  const ended = rows.some((r) => r.ended) ? ', or a path’s last figure when it ends sooner' : ''
  const restart = fromToday ? ` "From today" is your plan restarted from the balance in your latest check-in, ${formatCheckinDate(fromToday.since)}.` : ''
  return `Net worth and invested are on the same date for every path, ${when}, in ${planMoneyLabel(origin, format)}${ended}; FI and the house purchase are given as a month; ${monthlyPart(rows)}${restart}`
}
