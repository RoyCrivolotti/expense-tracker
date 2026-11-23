import { countsAsOccurrence, groupKeyString, groupTransactions, occurrenceKey } from '../engine/recurringDetect'
import { daysFromUsual, nearestUsualDate } from '../engine/recurringPredict'
import type { OccurrenceGroup } from '../engine/recurringTypes'
import {
  type MonthlySeries,
  type StoppedSeries,
  awaitedDates,
  chargeLoggedFor,
  isStopped,
  monthlySeriesOf,
} from '../engine/recurringUpcoming'
import type { Transaction, TxnType } from '../types'
import { type PagePayment, canMatch, paymentDirection, rowDirection } from './duplicate'
import { SERIES_MATCH_DAYS } from './seriesWindow'
import { foldTitle } from './text'

export { SERIES_MATCH_DAYS }

/** A waiting push, as the match needs it. */
export interface PushToMatch extends PagePayment {
  /** The account the push's card is linked to, or null when the push did not say. */
  accountId: number | null
  /**
   * The description capture's votes give this push's bank text at its price, or null when there are none. Votes at
   * any price may stand in. A voted name that differs from the one fitting series turns the hint into a "renamed?"
   * question, unless the voted name is itself a live series: then the push is most likely that series at a new price,
   * and it gets no hint rather than a question about the wrong one.
   */
  votedDescription: string | null
}

/** A monthly series a push fits, with what a review form fills in from it. */
export interface SeriesFit {
  /** The series' identity, as `groupKeyString` writes it and the recurring card keys its rows. */
  seriesKey: string
  /** The series' current name: its newest charge's description. */
  description: string
  accountId: number
  categoryId: number
  type: TxnType
  /** The series' newest charge, which the push's amount equals to the cent. */
  amountCents: number
  /** The usual date the push stands in for. */
  usualDate: string
  /** Days from that usual date to the push; negative when the push came early. */
  daysFromUsual: number
}

/**
 * What a waiting push may be, as far as the monthly series say. Only ever a hint for review: nothing here adds a row.
 *
 * - `none`: no series fits, and the push behaves as it would without the match.
 * - `series`: exactly one series fits, on the push's account, and the votes do not disagree.
 * - `choose`: two or more fit. They are offered side by side and none is preferred.
 * - `moved`: exactly one fits, but it is paid from another account: "moved it?".
 * - `renamed`: exactly one fits on the push's account, but the votes name it differently, likely its old name.
 */
export type SeriesHint =
  | { kind: 'none' }
  | { kind: 'series'; series: SeriesFit }
  | { kind: 'choose'; series: SeriesFit[] }
  | { kind: 'moved'; series: SeriesFit; pushAccountId: number }
  | { kind: 'renamed'; series: SeriesFit; votedDescription: string }

const NO_HINT: SeriesHint = { kind: 'none' }

interface Candidate {
  series: MonthlySeries
  seriesKey: string
  /** Every logged charge of the series: its own dates, plus rows of its identity the series has not been rebuilt with. */
  logged: string[]
}

/** The logged dates of each series identity in `transactions`, for a series that was built before they were logged. */
function loggedByKey(transactions: readonly Transaction[]): Map<string, string[]> {
  const byKey = new Map<string, string[]>()
  for (const txn of transactions) {
    if (!countsAsOccurrence(txn)) continue
    const key = occurrenceKey(txn)
    const dates = byKey.get(key)
    if (dates) dates.push(txn.date)
    else byKey.set(key, [txn.date])
  }
  return byKey
}

function candidatesOf(
  groups: readonly OccurrenceGroup[],
  transactions: readonly Transaction[],
  stopped: StoppedSeries,
): Candidate[] {
  const logged = loggedByKey(transactions)
  const candidates: Candidate[] = []
  for (const group of groups) {
    if (isStopped(group, stopped)) continue
    const series = monthlySeriesOf(group)
    if (!series) continue
    const seriesKey = groupKeyString(group.key)
    const extra = (logged.get(seriesKey) ?? []).filter((d) => !series.dates.includes(d))
    candidates.push({ series, seriesKey, logged: [...series.dates, ...extra].sort() })
  }
  return candidates
}

/**
 * The series this push fits, or null: the same direction, the amount to the cent, within `SERIES_MATCH_DAYS` of the
 * nearest usual day, and that usual day one the series is still waiting for, with no logged charge answering for it.
 */
function fitOf(
  push: PushToMatch & { amountCents: number },
  { series, seriesKey, logged }: Candidate,
): SeriesFit | null {
  const { group } = series
  if (Math.abs(group.amountCents) !== push.amountCents) return null
  if (rowDirection(group.key.type, group.amountCents) !== paymentDirection(push.suggestedType)) return null
  const offset = daysFromUsual(push.localDate, series.usual)
  if (Math.abs(offset) > SERIES_MATCH_DAYS) return null
  const usualDate = nearestUsualDate(push.localDate, series.usual)
  if (!awaitedDates(series).includes(usualDate)) return null
  if (chargeLoggedFor({ dates: logged, lead: series.lead }, usualDate)) return null
  return {
    seriesKey,
    description: group.label,
    accountId: group.key.accountId,
    categoryId: group.categoryId,
    type: group.key.type,
    amountCents: group.amountCents,
    usualDate,
    daysFromUsual: offset,
  }
}

/** Whether `name` is the current name of a live monthly series on `accountId`, or on any account when it is null. */
function isLiveSeriesName(
  candidates: readonly Candidate[],
  name: string,
  accountId: number | null,
): boolean {
  const folded = foldTitle(name)
  return candidates.some(
    ({ series }) =>
      (accountId === null || series.group.key.accountId === accountId) && foldTitle(series.group.label) === folded,
  )
}

function hintOf(
  push: PushToMatch,
  fits: SeriesFit[],
  candidates: readonly Candidate[],
): SeriesHint {
  if (fits.length === 0) return NO_HINT
  if (fits.length > 1) return { kind: 'choose', series: fits }
  const fit = fits[0]!
  if (push.accountId !== null && fit.accountId !== push.accountId) {
    return { kind: 'moved', series: fit, pushAccountId: push.accountId }
  }
  const voted = push.votedDescription?.trim() ?? ''
  if (voted !== '' && foldTitle(voted) !== foldTitle(fit.description)) {
    // The votes name another series that still exists: a price change landing on this one's price, not a rename.
    if (isLiveSeriesName(candidates, voted, push.accountId)) return NO_HINT
    return { kind: 'renamed', series: fit, votedDescription: voted }
  }
  return { kind: 'series', series: fit }
}

/** One month's charge of a series: the series and the usual date it stands in for. */
const chargeOf = (fit: SeriesFit) => `${fit.seriesKey}|${fit.usualDate}`

/** Older pushes first, so of two charges in one month the first takes the series. */
function byArrival(
  a: PushToMatch,
  b: PushToMatch,
): number {
  return a.localDate.localeCompare(b.localDate) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
}

/**
 * What each waiting push may be among the monthly series the recurring card reminds about. Worked out fresh on every
 * read and never stored, so a renamed series, a new bank text or a changed price is never held against a stale link.
 *
 * A push fits a series when it moves money the same way, its amount equals the series' newest charge to the cent, its
 * date is within `SERIES_MATCH_DAYS` of the nearest usual day (so the 30th and the 2nd are near), and no logged charge
 * answers for that usual day yet. A stopped series fits nothing, nor does one that has missed the charges it waits for.
 * Two pushes cannot both take one month's charge of a series: the older one does, and the newer falls to whatever else
 * fits it, so a charge taken twice in a month gets a hint once and the second goes to review as any other payment. A
 * push still waiting from last month takes only last month's charge, never this month's.
 *
 * `groups` are the series, built from `transactions` when absent, as the recurring card builds them. Rows in
 * `transactions` of a series' identity also count as logged charges, so a row logged since the series was built still
 * answers for its date. Pushes the match cannot read (no amount, no direction, another currency) get no hint.
 */
export function matchPushesToSeries(
  pushes: readonly PushToMatch[],
  transactions: readonly Transaction[],
  options: { stopped?: StoppedSeries; groups?: readonly OccurrenceGroup[] } = {},
): Map<string, SeriesHint> {
  const groups = options.groups ?? groupTransactions([...transactions])
  const candidates = candidatesOf(groups, transactions, options.stopped ?? {})
  const taken = new Set<string>()
  const hints = new Map<string, SeriesHint>()
  for (const push of [...pushes].sort(byArrival)) {
    if (!canMatch(push)) {
      hints.set(push.id, NO_HINT)
      continue
    }
    const fits: SeriesFit[] = []
    for (const candidate of candidates) {
      const fit = fitOf(push, candidate)
      if (fit && !taken.has(chargeOf(fit))) fits.push(fit)
    }
    const hint = hintOf(push, fits, candidates)
    if (hint.kind !== 'none' && hint.kind !== 'choose') taken.add(chargeOf(hint.series))
    hints.set(push.id, hint)
  }
  return hints
}
