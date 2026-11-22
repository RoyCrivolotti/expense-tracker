/**
 * What a copy started later says it did, one line per change, for the "Start a copy later…" sheet. It is
 * the re-baseline summary's wording where the two agree (the monthly amount, what was restated), and its
 * own where a copy differs: costs land on the copy's anniversary on or before their date (`startLater`),
 * so the copy says how much earlier, and a date after today is a plan, not something that happened.
 */
import type { LifeEvent } from '../types'
import type { CopyOutcome } from './copyOutcome'
import { shortMonthFullYearLabel, utcDateMs } from './dates'
import { currencyWord, formatCents, formatCentsCompact, formatPercent, type MoneyFormat } from './money'
import type { Rebaseline } from './rebaselinePatch'
import { monthlyLine, ownedHouseLine, restatedLines } from './rebaselineSummary'

export interface CopyContext {
  /** The copy's start. */
  start: string
  /** Today, which says whether something before the start has happened or is assumed to. */
  today: string
  /** The scenario the copy is made from. */
  sourceName: string
  format: MoneyFormat
  formatDate: (iso: string) => string
}

/** What a house purchase is called in these lines; it has no label of its own. */
export const HOUSE_NAME = 'House'

const MONTH_WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']

/** "six months", "one month", "12 days": how far apart two dates are, as a person would say it. */
export function gapText(
  earlier: string,
  later: string,
): string {
  const days = Math.round((utcDateMs(later) - utcDateMs(earlier)) / 86_400_000)
  if (days < 28) return days === 1 ? '1 day' : `${days} days`
  const months = Math.round(days / (365.25 / 12))
  const word = MONTH_WORDS[months - 1] ?? String(months)
  return months === 1 ? `${word} month` : `${word} months`
}

/** "<what> (<old date>) is <verb> on <new date>, <gap> earlier, because …": a cost the copy pays sooner. */
function earlierLine(
  what: string,
  verb: string,
  from: string,
  to: string,
  ctx: CopyContext,
): string {
  return `${what} (${ctx.formatDate(from)}) is ${verb} on ${ctx.formatDate(to)}, ${gapText(to, from)} earlier, because the copy counts its years from its own start.`
}

/** A cost the copy counts as already paid: what happened by today is in the balance, what is still to come is assumed to be. */
function beforeLine(
  what: string,
  from: string,
  ctx: CopyContext,
): string {
  const tail =
    from <= ctx.today
      ? "so it's already in the starting balance."
      : 'so the copy takes it to be in the starting balance.'
  return `${what} (${ctx.formatDate(from)}) is before the new start, ${tail}`
}

function eventLines(
  r: Rebaseline,
  ctx: CopyContext,
): { lines: string[]; moved: boolean } {
  const name = (e: LifeEvent) => e.label || formatCents(e.amountCents, ctx.format)
  const lines: string[] = []
  let moved = false
  for (const c of r.carried) {
    if (c.to !== null && c.to < c.from) lines.push(earlierLine(name(c.event), 'paid', c.from, c.to, ctx))
    else if (c.to !== null && c.to > c.from) {
      lines.push(`${name(c.event)} moves from ${ctx.formatDate(c.from)} to ${ctx.formatDate(c.to)}.`)
      moved = true
    } else if (c.to === null && c.from > ctx.start)
      lines.push(earlierLine(name(c.event), 'paid', c.from, ctx.start, ctx))
    else if (c.to === null) lines.push(beforeLine(name(c.event), c.from, ctx))
  }
  return { lines, moved }
}

/** Whether the copy buys its house before its source does: on an earlier anniversary, or at its own start. */
export function buysHouseSooner(
  r: Rebaseline,
  start: string,
): boolean {
  const house = r.house
  return house !== null && (house.to === null ? house.from > start : house.to < house.from)
}

function houseLines(
  r: Rebaseline,
  ctx: CopyContext,
): string[] {
  const house = r.house
  const lines: string[] = []
  if (house && house.to !== null && house.to < house.from)
    lines.push(earlierLine(HOUSE_NAME, 'bought', house.from, house.to, ctx))
  if (house && house.to === null && house.from > ctx.start)
    lines.push(earlierLine(HOUSE_NAME, 'bought', house.from, ctx.start, ctx))
  if (r.ownedHouse)
    lines.push(ownedHouseLine(r, ctx.format, ctx.formatDate, buysHouseSooner(r, ctx.start) ? 'at-start' : 'behind'))
  if (buysHouseSooner(r, ctx.start)) {
    const source = ctx.sourceName
    lines.push(
      `Because the copy buys the house sooner, it owns it for longer, so its net worth can read higher than ${source}'s. Compare invested to see like with like.`,
      `Paying for the house sooner also means that money stops growing sooner, so the copy's invested balance reads lower than ${source}'s from then on.`,
    )
  }
  return lines
}

/** What the copy changes besides its start, one line each; empty when nothing else changed. */
export function startLaterSummary(
  r: Rebaseline,
  ctx: CopyContext,
): string[] {
  const monthly = monthlyLine(r, ctx.format, ctx.formatDate)
  const events = eventLines(r, ctx)
  return [
    ...(monthly ? [monthly] : []),
    ...restatedLines(r, ctx.format),
    ...events.lines,
    ...houseLines(r, ctx),
    ...(events.moved ? ['Plan years are whole, so a later date lands on the next anniversary of the new start.'] : []),
  ]
}

/** What the copy pays at its start that its source pays later, by name: what it cannot pay for when the balance falls short. */
export function paidAtStartNames(
  r: Rebaseline,
  start: string,
  format: MoneyFormat,
): string[] {
  const events = r.carried
    .filter((c) => c.to === null && c.from > start)
    .map((c) => c.event.label || formatCents(c.event.amountCents, format))
  const house = r.house && r.house.to === null && r.house.from > start ? [HOUSE_NAME] : []
  return [...house, ...events]
}

/** The line in place of a suggestion when the plan cannot pay at the start for what the copy pays then. */
export function cannotPayLine(
  names: string[],
  shortByCents: number,
  ctx: Pick<CopyContext, 'start' | 'format' | 'formatDate'>,
): string {
  const what = names.length > 0 ? names.join(' and ') : 'what it pays at the start'
  return `The plan can't pay for ${what} by ${ctx.formatDate(ctx.start)}: it's ${formatCentsCompact(shortByCents, ctx.format)} short on that date.`
}

/** Within this share of the source's figure the two are the same for the person reading them. */
const ABOUT_THE_SAME = 0.005

/**
 * What the copy comes to against its source, in a line: when its net worth reads higher, and where its invested
 * balance is on the day the table reads every row, in the euros of the calendar's origin, as the table has them.
 * Null when there is nothing to say: net worth never higher and no invested figure on that day.
 */
export function outcomeLine(
  o: CopyOutcome,
  ctx: Pick<CopyContext, 'sourceName' | 'format'>,
): string | null {
  const source = ctx.sourceName
  const month = (ym: string) => shortMonthFullYearLabel(ym)
  const above = o.netWorthAbove
  const lower = o.netWorthGapCents !== null && o.netWorthGapCents <= 0 ? ', then lower' : ''
  const net = above
    ? `its net worth reads higher than ${source}'s from ${month(above.from)} to ${month(above.until)}${lower}.`
    : null
  const invested = investedSentence(o, ctx)
  if (net && invested) return `In short: ${net} ${invested}`
  if (net) return `In short: ${net}`
  return invested ? `In short: i${invested.slice(1)}` : null
}

function investedSentence(
  o: CopyOutcome,
  { sourceName: source, format }: Pick<CopyContext, 'sourceName' | 'format'>,
): string | null {
  const gap = o.investedGapCents
  if (gap === null || o.sourceInvestedCents === null) return null
  const year = o.endDate.slice(0, 4)
  const share = o.sourceInvestedCents > 0 ? gap / o.sourceInvestedCents : 0
  if (Math.abs(share) < ABOUT_THE_SAME)
    return `In ${year} its invested balance is within ${formatPercent(ABOUT_THE_SAME, format)} of ${source}'s.`
  const money = `${o.origin.slice(0, 4)} ${currencyWord(format)}`
  const side = gap < 0 ? 'under' : 'over'
  return `In ${year} its invested balance is about ${formatCentsCompact(Math.abs(gap), format)} (${formatPercent(Math.abs(share), format, 0)}) ${side} ${source}'s, in ${money}.`
}
