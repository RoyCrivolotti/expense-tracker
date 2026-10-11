import type { AnnotationDot, ChartAnnotations } from '../../../charts/LinearChart'
import { crossingYears, currencyWord, dateAtYears, type MoneyFormat, type ProjectionParams } from '../../../../engine'
import { formatMoneyShort } from '../chartTheme'
import { planMoneyLabel } from '../planMoneyLabel'

/** A path of the chart, as far as this needs to know it. */
export interface PickLine {
  id: string
  name: string
  color: string
  params: ProjectionParams
  /** The date its plan starts on, which dates the year it reaches the milestone in. */
  planStartDate: string | null
}

/** One path's row under the chart: when it reaches the picked milestone. */
export interface PickRow {
  id: string
  name: string
  color: string
  /** "Mar 2043, in 16 years 6 months", or "not within its horizon". */
  text: string
}

export interface MilestonePick {
  dots: AnnotationDot[]
  rows: PickRow[]
}

const MS_DAY = 86_400_000

/** Whole months from one calendar date to a later one, rounded. */
function monthsBetween(from: string, to: string): number {
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_DAY
  return Math.round(days / (365.25 / 12))
}

/** "in 16 years 6 months", "in 1 year", "in 5 months", or "now" when it is not ahead. */
export function inText(months: number): string {
  if (months <= 0) return 'now'
  const y = Math.floor(months / 12)
  const m = months % 12
  const years = y === 0 ? '' : `${y} ${y === 1 ? 'year' : 'years'}`
  const rest = m === 0 ? '' : `${m} ${m === 1 ? 'month' : 'months'}`
  return `in ${[years, rest].filter(Boolean).join(' ')}`
}

/** The place on the x axis, fractional between two years, of a year offset; null outside the years drawn. */
function indexOfYear(years: readonly number[], t: number): number | null {
  const first = years[0]
  const last = years[years.length - 1]
  if (first === undefined || last === undefined || t < first || t > last) return null
  for (let i = 0; i < years.length - 1; i++) {
    const a = years[i]!
    const b = years[i + 1]!
    if (t >= a && t <= b) return b === a ? i : i + (t - a) / (b - a)
  }
  return years.length - 1
}

interface PickInput {
  lines: readonly PickLine[]
  amountCents: number
  inflationRate: number
  nominalMode: boolean
  /** The chart's x axis, in years from the plan start. */
  years: readonly number[]
  /** Today, to count the years from now. */
  today: string
  locale: string
}

/**
 * Where each path reaches the picked milestone, which is an amount on the account. A path is dotted on the milestone's
 * own line, in the chart's money (the amount itself in Nominal, the amount less the inflation so far in Purchasing
 * power), labelled with the calendar year it reaches it in. Its row says the month and how long from today.
 */
export function pickCrossings({ lines, amountCents, inflationRate, nominalMode, years, today, locale }: PickInput): MilestonePick {
  const dots: AnnotationDot[] = []
  const rows: PickRow[] = []
  for (const line of lines) {
    const t = crossingYears(line.params, amountCents, inflationRate)
    if (t === null) {
      rows.push({ id: line.id, name: line.name, color: line.color, text: 'not within its horizon' })
      continue
    }
    const date = line.planStartDate ? dateAtYears(line.planStartDate, t) : null
    const label = date ? date.slice(0, 4) : `year ${Math.round(t * 10) / 10}`
    const index = indexOfYear(years, t)
    if (index !== null) {
      const value = nominalMode ? amountCents : amountCents / Math.pow(1 + inflationRate, t)
      dots.push({ index, value, color: line.color, label })
    }
    const month = date
      ? new Date(`${date}T00:00:00Z`).toLocaleDateString(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' })
      : label
    rows.push({ id: line.id, name: line.name, color: line.color, text: date ? `${month}, ${inText(monthsBetween(today, date))}` : month })
  }
  return { dots, rows }
}

/**
 * The note at the right end of the picked line. In Purchasing power the line falls with the inflation, so it says what
 * the amount is worth there; in Nominal it is level at the amount, and says only that.
 */
export function endNoteFor({
  amountCents,
  inflationRate,
  nominalMode,
  years,
  planStartDate,
  format,
}: {
  amountCents: number
  inflationRate: number
  nominalMode: boolean
  years: readonly number[]
  planStartDate: string | null | undefined
  format: MoneyFormat
}): ChartAnnotations['endNote'] {
  const last = years[years.length - 1]
  if (last === undefined) return undefined
  const first = `${formatMoneyShort(amountCents, format)} on account`
  if (nominalMode) return { index: years.length - 1, value: amountCents, lines: [first] }
  const worth = amountCents / Math.pow(1 + inflationRate, last)
  return {
    index: years.length - 1,
    value: worth,
    lines: [first, `= ${formatMoneyShort(Math.round(worth), format)} in ${planMoneyLabel(planStartDate, format)}`],
    below: true,
  }
}

/** What the grey dotted lines are, in the words of the view the chart is in: the two views move different lines. */
export function milestoneNote(nominalMode: boolean, format: MoneyFormat): string {
  const money = currencyWord(format)
  return nominalMode
    ? `Grey dotted lines are your milestones. They are amounts on your account, so they stay level here. The FI target is in the plan\u2019s ${money}, so it rises with prices.`
    : `Grey dotted lines are your milestones. They are amounts on your account, so in the plan\u2019s ${money} they slope down: where a line crosses one, your account reaches it. Pick one to see when.`
}
