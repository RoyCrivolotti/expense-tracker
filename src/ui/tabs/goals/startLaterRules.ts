import type { NewGoalScenario } from '../../../data/dataSource'
import { SCENARIO_NAME_MAX_LENGTH, dateAtYears, isCalendarDate } from '../../../engine'
import type { InvestedSnapshot } from './checkinDate'

/** The check-in to start from: the latest on or before the date. One after it says nothing about the date. */
export function checkinOnOrBefore(
  checkins: readonly InvestedSnapshot[],
  date: string,
): InvestedSnapshot | null {
  return checkins
    .filter((c) => c.date <= date)
    .reduce<InvestedSnapshot | null>((best, c) => (!best || c.date > best.date ? c : best), null)
}

/** Where the date picker opens: the latest check-in, which is the balance known for certain, else today. */
export function defaultStartDate(
  checkins: readonly InvestedSnapshot[],
  today: string,
): string {
  return checkinOnOrBefore(checkins, '9999-12-31')?.date ?? today
}

/** Why a copy of `source` cannot start on `date`, or null when it can. */
export function startRefusal(
  source: NewGoalScenario,
  date: string,
  formatDate: (iso: string) => string,
): string | null {
  const start = source.planStartDate
  if (!start || !isCalendarDate(start)) return `${source.name} has no start date. Set one under Plan start first.`
  if (date < start) return `Pick a date on or after ${source.name}'s start, ${formatDate(start)}.`
  const end = dateAtYears(start, source.horizonYears)
  if (date > end) return `Pick a date before ${source.name}'s last year, ${end.slice(0, 4)}.`
  return null
}

/** "<name>, from <year>", kept inside the longest name a scenario may have. */
export function copyName(
  source: string,
  date: string,
): string {
  const tail = `, from ${date.slice(0, 4)}`
  return `${source.slice(0, SCENARIO_NAME_MAX_LENGTH - tail.length)}${tail}`
}

/** Whether `s` holds its house on `date`: owned from its start, or bought on or before the date. */
export function ownsHouseBy(
  s: Pick<NewGoalScenario, 'housePurchaseYear' | 'planStartDate'>,
  date: string,
): boolean {
  const year = s.housePurchaseYear
  const start = s.planStartDate
  return year !== null && start != null && isCalendarDate(start) && dateAtYears(start, year) <= date
}
