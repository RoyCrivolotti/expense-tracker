import type { GoalScenario } from '../../../../types'
import type { NewGoalScenario } from '../../../../data/dataSource'
import { fiYearsExact, formatCents, projectNetWorth, scenarioToParams, yearsToFi } from '../../../../engine'
import { fiAround } from '../fiAround'
import type { MoneyFormat, PlanFromToday, YearPoint } from '../../../../engine'
import { formatMoneyShort } from '../chartTheme'
import { tableName } from '../scenarioNames'
import { comparisonOrigin, figureAt, fiOnCalendar, houseOnCalendar, place, restYear } from './comparisonCalendar'

export interface ComparisonRow {
  /** Stable across renames and shared short names: the scenario id, or 'draft'. */
  key: string
  name: string
  color: string
  /** The path's last plan year; set only where each row is read at its own plan years. */
  horizonYears?: number
  /**
   * The plan year net worth and invested are read at: the one asked for, or the horizon when shorter. When
   * scenarios start on different days, the year of the shared calendar every row is read at.
   */
  atYear: number
  fi: string
  netWorth: string
  invested: string
  /** The figures behind `netWorth` and `invested`; null for a row that has not started by the date read. */
  netWorthCents: number | null
  investedCents: number | null
  /** The row's path ended before the date read, so its figures are its last. */
  ended: boolean
  /** With no window on one calendar: whether `atYear` is the last year every row reaches, not the last year shown. */
  everyReaches: boolean
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

/** Net worth and invested at a plan year of the scenario's own, in its own euros. */
function ownYearFigures(
  point: YearPoint | undefined,
  format: MoneyFormat,
): Pick<ComparisonRow, 'netWorth' | 'invested' | 'netWorthCents' | 'investedCents' | 'ended'> {
  if (!point) return { netWorth: '', invested: '', netWorthCents: null, investedCents: null, ended: false }
  return {
    netWorth: formatMoneyShort(point.netWorthCents, format),
    invested: formatMoneyShort(point.investedCents, format),
    netWorthCents: point.netWorthCents,
    investedCents: point.investedCents,
    ended: false,
  }
}

type Entry = { key: string; name: string; color: string; scenario: GoalScenario | (NewGoalScenario & { id: number }) }

/**
 * Every row on the calendar that starts on `origin`, each read on the same day and in the origin's euros:
 * `year` years after it, or with no window the year `restYear` gives. The plan from today joins at the check-in.
 */
function calendarRows(all: Entry[], origin: string, format: MoneyFormat, inflationRate: number, year: number | null): ComparisonRow[] {
  const placed = all.map((entry) => ({ entry, row: place(entry.scenario, origin, inflationRate) }))
  const rest = year === null ? restYear(placed.map((p) => p.row)) : { year, everyReaches: true }
  const atYear = rest.year
  return placed.map(({ entry: { key, name, color, scenario }, row }) => {
    const netWorth = figureAt(row, atYear, 'netWorth', inflationRate, format)
    const invested = figureAt(row, atYear, 'invested', inflationRate, format)
    return {
      key,
      name,
      color,
      atYear,
      everyReaches: rest.everyReaches,
      fi: fiOnCalendar(row, inflationRate),
      netWorth: netWorth.text,
      invested: invested.text,
      netWorthCents: netWorth.cents,
      investedCents: invested.cents,
      ended: invested.ended,
      house: houseOnCalendar(row),
      monthly: formatCents(scenario.monthlyContributionCents, format),
      monthlyLater: laterMonthly(scenario, format),
    }
  })
}

/**
 * The numbers the charts make you hover for, one row per scenario, plus one for the draft
 * when it is a line of its own. A loaded scenario with no edits is drawn as the draft on
 * the chart, so a row for both would be the same plan twice. Net worth and invested are
 * read at `year`, or at each path's horizon when null or when the horizon is shorter.
 * When the scenarios start on different days they are read on one calendar instead
 * (`calendarRows`), so that no two rows are on different dates or in different money.
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
  const all: Entry[] = scenarios.flatMap((s) => [
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
  const origin = comparisonOrigin(scenarios, draft)
  if (origin !== null) return calendarRows(all, origin, format, inflationRate, year)
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
      everyReaches: true,
      fi: fiCell(params, scenario, key === 'from-today' || (fromToday !== null && scenario.id === fromToday.scenario.id && key !== 'draft')),
      ...ownYearFigures(end, format),
      house: houseLabel(scenario.housePurchaseYear),
      // Exact: 1,000, 1,400 and 1,499 a month are three different plans, not "1k".
      monthly: formatCents(scenario.monthlyContributionCents, format),
      monthlyLater: laterMonthly(scenario, format),
    }
  })
}
