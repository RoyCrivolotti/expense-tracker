/**
 * What the "Start a copy later…" sheet shows and makes, from what it holds: the date, and a balance and a
 * name only once the person has typed them. Everything else is derived on each render, so a suggestion
 * follows the date until the person types their own figure, and nothing is stored that a date change
 * could leave stale.
 */
import type { GoalScenario } from '../../../types'
import type { NewGoalScenario } from '../../../data/dataSource'
import {
  SCENARIO_NAME_MAX_LENGTH,
  cannotPayLine,
  copyOutcome,
  dateAtYears,
  formatCentsCompact,
  isCalendarDate,
  outcomeLine,
  paidAtStartNames,
  pickScenarioColor,
  scenarioAxis,
  startLater,
  startLaterSummary,
  suggestedStart,
  type CopyOutcome,
  type MoneyFormat,
  type Rebaseline,
  type SuggestedStart,
} from '../../../engine'
import type { InvestedSnapshot } from './checkinDate'
import { place, restYear } from './charts/comparisonCalendar'
import { planMoneyLabel } from './planMoneyLabel'

export interface StartLaterInputs {
  source: NewGoalScenario
  /** Every check-in's invested total and date, in any order. */
  checkins: readonly InvestedSnapshot[]
  /** The saved scenarios, for the copy's colour and place in the list. */
  scenarios: readonly GoalScenario[]
  inflationRate: number
  today: string
  format: MoneyFormat
  formatDate: (iso: string) => string
}

/** What the person has set: the date always, a balance and a name only once typed (null follows the suggestion). */
export interface StartLaterChoice {
  date: string
  typedCents: number | null
  typedName: string | null
}

export interface StartLaterView {
  /** Why the date cannot be used, said under the date field; null when it can. */
  refusal: string | null
  balanceCents: number
  /** "in 2028 euros", with "after buying the house" when the purchase is behind the copy's start. */
  balanceHint: string
  /** Where the suggested balance came from, or that the plan cannot pay at the start. */
  sourceLine: string
  /** That the suggestion is under the source's line, when by more than a few euros. */
  lowerLine: string | null
  /** The suggestion, offered back once a typed balance differs from it. */
  useCents: number | null
  /**
   * For a check-in's balance given to a scenario that owns its house by then: that it is taken to be after buying,
   * and the scenario's own figure, for someone who has not bought.
   */
  houseNote: { text: string; cents: number } | null
  /** What the copy comes to against its source, in a line; null when nothing can be made. */
  outcome: string | null
  /** What changes in the copy, one line each. */
  lines: string[]
  name: string
  /** What Create saves; null when it cannot. */
  input: NewGoalScenario | null
}

/** The check-in to start from: the latest on or before the date. One after it says nothing about the date. */
export function checkinOnOrBefore(checkins: readonly InvestedSnapshot[], date: string): InvestedSnapshot | null {
  return checkins.filter((c) => c.date <= date).reduce<InvestedSnapshot | null>((best, c) => (!best || c.date > best.date ? c : best), null)
}

/** Where the date picker opens: the latest check-in, which is the balance known for certain, else today. */
export function defaultStartDate(checkins: readonly InvestedSnapshot[], today: string): string {
  return checkinOnOrBefore(checkins, '9999-12-31')?.date ?? today
}

/** Why a copy of `source` cannot start on `date`, or null when it can. */
export function startRefusal(source: NewGoalScenario, date: string, formatDate: (iso: string) => string): string | null {
  const start = source.planStartDate
  if (!start || !isCalendarDate(start)) return `${source.name} has no start date. Set one under Plan start first.`
  if (date < start) return `Pick a date on or after ${source.name}'s start, ${formatDate(start)}.`
  const end = dateAtYears(start, source.horizonYears)
  if (date > end) return `Pick a date before ${source.name}'s last year, ${end.slice(0, 4)}.`
  return null
}

/** "<name>, from <year>", kept inside the longest name a scenario may have. */
export function copyName(source: string, date: string): string {
  const tail = `, from ${date.slice(0, 4)}`
  return `${source.slice(0, SCENARIO_NAME_MAX_LENGTH - tail.length)}${tail}`
}

function sourceLine(s: SuggestedStart | null, checkin: InvestedSnapshot | null, inputs: StartLaterInputs, names: string[], date: string): string {
  const { source, format, formatDate } = inputs
  if (s && s.shortByCents > 0) return cannotPayLine(names, s.shortByCents, { start: date, format, formatDate })
  if (s?.from === 'checkin') return `Your investments in your check-in of ${formatDate(checkin!.date)}.`
  if (s?.from === 'plan-from-checkin') {
    return `${source.name}, carried on from your check-in of ${formatDate(checkin!.date)}, has about ${formatCentsCompact(s.cents, format)} on that date.`
  }
  if (s?.from === 'own-line') return `${source.name}'s own line on that date.`
  return 'Type what you expect to have invested on that date.'
}

/** Under this, a suggestion lowered by the corner rule is a cent or two of rounding and not worth a sentence. */
const LOWER_WORTH_SAYING_CENTS = 500

function lowerLine(s: SuggestedStart | null, inputs: StartLaterInputs): string | null {
  if (!s || s.shortByCents > 0 || s.lowerByCents <= LOWER_WORTH_SAYING_CENTS) return null
  const name = inputs.source.name
  return `That's ${formatCentsCompact(s.lowerByCents, inputs.format)} less than ${name} has on that date. A copy that starts part way through ${name}'s year would otherwise run a little above ${name} for some months, so it starts that much lower.`
}

/** The suggestion for the date, and the copy made from the balance in use; both null for a date that cannot be used. */
function reading(inputs: StartLaterInputs, choice: StartLaterChoice) {
  const { source, checkins, inflationRate, formatDate } = inputs
  const { date, typedCents } = choice
  const valid = isCalendarDate(date)
  const refusal = valid ? startRefusal(source, date, formatDate) : null
  const checkin = checkinOnOrBefore(checkins, date)
  const suggestion = refusal || !valid ? null : suggestedStart(source, checkin, date, inflationRate)
  const balanceCents = typedCents ?? suggestion?.cents ?? 0
  const made = suggestion ? startLater(source, { date, investedCents: balanceCents }, inflationRate) : null
  // A plan that cannot pay at the start has no balance to offer: the copy waits for one the person types.
  const offered = suggestion && suggestion.shortByCents === 0 ? suggestion.cents : null
  return { refusal, checkin, suggestion, balanceCents, made, offered }
}

/** What Create saves: the source with the copy's fields, its own colour, last in the list. Never the plan: a new scenario is not. */
function copyInput(inputs: StartLaterInputs, made: Rebaseline, name: string): NewGoalScenario {
  const { source, scenarios } = inputs
  return { ...source, ...made.patch, name, color: pickScenarioColor(scenarios.map((s) => s.color)), sortOrder: scenarios.length }
}

/** Whether `s` holds its house on `date`: owned from its start, or bought on or before the date. */
export function ownsHouseBy(s: Pick<NewGoalScenario, 'housePurchaseYear' | 'planStartDate'>, date: string): boolean {
  const year = s.housePurchaseYear
  const start = s.planStartDate
  return year !== null && start != null && isCalendarDate(start) && dateAtYears(start, year) <= date
}

/**
 * A check-in is what was invested, whatever was bought. A scenario that owns its house by the check-in reads it
 * as what was left after buying, which is wrong for someone who has not bought: they are told, and offered the
 * scenario's own line instead. This is the year-0 house: a balance from the wrong side of the purchase.
 */
function houseNote(inputs: StartLaterInputs, s: SuggestedStart | null, checkin: InvestedSnapshot | null, date: string): StartLaterView['houseNote'] {
  const { source, inflationRate, format } = inputs
  if (!s || !checkin || s.from === 'own-line' || !ownsHouseBy(source, checkin.date)) return null
  const own = suggestedStart(source, null, date, inflationRate)
  if (!own || own.shortByCents > 0) return null
  const amount = formatCentsCompact(own.cents, format)
  return {
    text: `This counts your check-in as after buying the house, as ${source.name} has it. If you have not bought it, ${source.name}'s own line has about ${amount} on that date.`,
    cents: own.cents,
  }
}

/** "in 2028 euros", and that the balance is what is left after the house when the purchase is behind the start. */
function balanceHint(made: Rebaseline | null, date: string, format: MoneyFormat): string {
  // Behind the start, or owned from day one: either way the balance is what is left after buying.
  const owned = made !== null && ((made.house !== null && made.house.to === null) || made.patch.housePurchaseYear === 0)
  const afterHouse = owned ? ', after buying the house' : ''
  return `in ${planMoneyLabel(date, format)}${afterHouse}`
}

/**
 * The copy against its source as the table will read them once it is made: on the calendar of every saved
 * scenario plus the copy, from the earliest start, at the year the table rests on (`restYear`), in the
 * origin's euros. Read on the source's own end instead, the gap differed from the table's whenever another
 * scenario started earlier or ended sooner.
 */
export function outcomeOnTable(inputs: StartLaterInputs, made: Rebaseline): CopyOutcome | null {
  const { source, scenarios, inflationRate } = inputs
  const copy = { ...source, ...made.patch, id: 0 }
  // The source as it is copied: the same as its saved row unless it has unsaved edits, which the copy carries.
  const rows = [...scenarios, { ...source, id: -1 }, copy]
  const { origin } = scenarioAxis(rows.map((s) => s.planStartDate))
  if (origin === null) return null
  const rest = restYear(rows.map((s) => place(s, origin, inflationRate)))
  return copyOutcome(source, copy, inflationRate, { origin, year: rest.year })
}

/** Nothing for a copy from a balance nobody has offered or typed, which no one can make. */
function outcomeOf(inputs: StartLaterInputs, made: Rebaseline | null, hasBalance: boolean): string | null {
  const outcome = made && hasBalance && outcomeOnTable(inputs, made)
  return outcome ? outcomeLine(outcome, { sourceName: inputs.source.name, format: inputs.format }) : null
}

/** The whole sheet for the date, balance and name the person has set. */
export function startLaterView(inputs: StartLaterInputs, choice: StartLaterChoice): StartLaterView {
  const { source, today, format, formatDate } = inputs
  const { date, typedCents } = choice
  const { refusal, checkin, suggestion, balanceCents, made, offered } = reading(inputs, choice)
  const name = choice.typedName ?? copyName(source.name, date)
  const canMake = made !== null && name.trim().length > 0 && (offered !== null || typedCents !== null)
  return {
    refusal,
    balanceCents,
    balanceHint: balanceHint(made, date, format),
    sourceLine: sourceLine(suggestion, checkin, inputs, made ? paidAtStartNames(made, date, format) : [], date),
    lowerLine: lowerLine(suggestion, inputs),
    useCents: offered !== null && typedCents !== null && typedCents !== offered ? offered : null,
    houseNote: houseNote(inputs, suggestion, checkin, date),
    outcome: outcomeOf(inputs, made, offered !== null || typedCents !== null),
    lines: made ? startLaterSummary(made, { start: date, today, sourceName: source.name, format, formatDate }) : [],
    name,
    input: canMake ? copyInput(inputs, made, name.trim()) : null,
  }
}
