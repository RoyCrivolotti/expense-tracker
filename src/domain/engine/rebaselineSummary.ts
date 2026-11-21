/**
 * What a re-baseline says it did, one line per change, for the editor's note and the Progress confirm
 * sheet. The re-baseline itself is in `rebaselinePatch.ts`.
 */
import type { LifeEvent } from '../types'
import { currencyWord, formatCents, formatPercent, type MoneyFormat } from './money'
import type { Rebaseline } from './rebaselinePatch'

/** What happened to the monthly amount, or null when it did not move. */
export function monthlyLine(r: Rebaseline, format: MoneyFormat, formatDate: (iso: string) => string): string | null {
  if (r.droppedSteps.length === 0) return null
  const from = formatCents(r.previous.monthlyContributionCents, format)
  const to = formatCents(r.patch.monthlyContributionCents, format)
  const changes = r.droppedSteps
    .map((s) => `${formatCents(s.monthlyCents, format)} from ${formatDate(`${s.from}-01`)}`)
    .join(', then ')
  const one = r.droppedSteps.length === 1
  return `Monthly investing goes from ${from} to ${to}: the change to ${changes} ${one ? 'is' : 'are'} already behind the new start, so ${one ? 'it is' : 'they are'} in the monthly amount.`
}

/** "3 years", "2,5 years", "1 year": a whole number of years is said plainly, a part year to one decimal. */
export function yearsText(years: number, format: MoneyFormat): string {
  const rounded = Math.round(years * 10) / 10
  const text = rounded.toLocaleString(format.locale, { maximumFractionDigits: 1 })
  return rounded === 1 ? '1 year' : `${text} years`
}

/** What was counted in the euros of the new start, and the price of a house still to buy. */
export function restatedLines(r: Rebaseline, format: MoneyFormat): string[] {
  const lines: string[] = []
  const { restated, housePrice } = r
  if (restated) {
    const money = (pair: [number, number]) => `${formatCents(pair[0], format)} becomes ${formatCents(pair[1], format)}`
    lines.push(
      `After ${yearsText(restated.years, format)} at ${formatPercent(restated.inflationRate, format)} inflation, the amounts typed in the ${currencyWord(format)} of the old start are counted in the ${currencyWord(format)} of the new one: spending ${money(restated.spend)}, rent ${money(restated.rent)}, fees ${money(restated.fees)}, and event amounts the same way.`,
    )
  }
  if (housePrice) {
    const years = restated ? yearsText(restated.years, format) : 'the years since the old start'
    lines.push(
      `The house price ${formatCents(housePrice.from, format)} becomes ${formatCents(housePrice.to, format)}: houses rose ${formatPercent(housePrice.appreciation, format)} a year over those ${years}.`,
    )
  }
  return lines
}

/**
 * A house already bought is held as owned from day one, worth what it is worth now, with what the
 * loan's own schedule says is still owed. That owed amount is an assumption, not a balance read from
 * anywhere, so it is said, and so is how to undo a purchase that has not happened.
 */
export function ownedHouseLine(
  r: Rebaseline,
  format: MoneyFormat,
  formatDate: (iso: string) => string,
  copy?: 'behind' | 'at-start',
): string {
  const owned = r.ownedHouse!
  const behind = r.house && copy !== 'at-start'
    ? `The house purchase (${formatDate(r.house.from)}) is behind the new start, so the plan holds the house as owned from day one`
    : 'The plan holds the house as owned from day one'
  const left = owned.owedCents === 0 ? 'with nothing owed' : `with about ${formatCents(owned.owedCents, format)} still owed over ${yearsText(owned.remainingYears, format)}`
  const note = owned.raisedToOwed ? ' It owes more than it is worth on these figures, so its value is set to what is owed.' : ''
  // A copy says what it did with the purchase in a line of its own, and Cancel there changes nothing to undo.
  const unsure = r.house && !copy ? ' If you have not bought it yet, cancel, move the purchase year, then re-baseline.' : ''
  return `${behind}: worth about ${formatCents(owned.valueCents, format)}, ${left} (the loan's own schedule, not a balance you logged).${note}${unsure}`
}

/**
 * What the re-baseline changes besides the start, one line each, for the editor's note and
 * the Progress confirm sheet: empty when nothing but the start changed. Life events keep
 * their calendar dates as far as whole plan years allow, so a later one can land on the
 * next anniversary of the new start, and the dates say by how much.
 */
export function rebaselineSummary(
  r: Rebaseline,
  format: MoneyFormat,
  formatDate: (iso: string) => string,
): string[] {
  const name = (e: LifeEvent) => e.label || formatCents(e.amountCents, format)
  const lines: string[] = []
  const monthly = monthlyLine(r, format, formatDate)
  if (monthly) lines.push(monthly)
  lines.push(...restatedLines(r, format))
  const moved = r.carried.filter((c) => c.to !== null && c.to !== c.from)
  for (const c of moved) {
    lines.push(`${name(c.event)} moves from ${formatDate(c.from)} to ${formatDate(c.to!)}.`)
  }
  if (r.ownedHouse) {
    lines.push(ownedHouseLine(r, format, formatDate))
  } else if (r.house && r.house.to !== null && r.house.to !== r.house.from) {
    lines.push(`The house purchase moves from ${formatDate(r.house.from)} to ${formatDate(r.house.to)}.`)
  }
  if (moved.length > 0 || (r.house?.to != null && r.house.to !== r.house.from)) {
    lines.push('Plan years are whole, so a later date lands on the next anniversary of the new start.')
  }
  for (const c of r.carried.filter((x) => x.to === null)) {
    lines.push(`${name(c.event)} (${formatDate(c.from)}) is already in the balance, so it is dropped.`)
  }
  return lines
}
