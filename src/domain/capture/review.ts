import { foldTitle } from './text'
import type { SuggestedType } from './types'

/** How many typed rows a merchant needs before one tap may add its payment without a look. */
export const MIN_SIGHTINGS = 2

/** What a person's own history says about a merchant, from the rows the app holds. */
export interface MerchantHistory {
  /** Typed expenses that carry this merchant's name, however long ago. */
  sightings: number
  /** The description the person most often gives this merchant, the way they last spelled it. */
  label: string | null
  /** The category most often given with that description. */
  categoryId: number | null
  /**
   * True when the person has settled on `label`: it was typed at least `MIN_SIGHTINGS` times and strictly more often than
   * any other description. False for a merchant with no history too, which `sightings` already reports.
   */
  settled: boolean
}

/** The part of a typed row the history reads. */
export interface HistoryRow {
  id: number
  date: string
  description: string
  type: string
  categoryId: number | null
  cancelled: boolean
}

/**
 * A merchant's name as a bank writes it and as a person types it, made comparable: accents and case folded, and the
 * words that hold a digit dropped, since those are store and terminal numbers ("CAFE EXAMPLE 0042"). Empty when
 * nothing is left, which matches nothing.
 */
export function merchantKey(text: string): string {
  return foldTitle(text)
    .split(' ')
    .filter((word) => word !== '' && !/\d/.test(word))
    .join(' ')
}

/**
 * The merchant as the bank wrote it, less the words that hold a digit (store and terminal numbers), for a merchant the
 * person has not typed before. The bank's own text when nothing else is left.
 */
export function bankMerchantName(text: string): string {
  const words = text.split(' ').filter((word) => word !== '' && !/\d/.test(word))
  return words.length > 0 ? words.join(' ') : text
}

/** Rows older than this many months do not vote, so a lasting rename overtakes the old name and ancient history cannot dominate. */
export const DESCRIPTION_WINDOW_MONTHS = 12

/** Every merchant in the typed rows at once, so a list of payments is described in one pass over the rows. */
export type MerchantIndex = ReadonlyMap<string, MerchantHistory>

const isNewer = (a: HistoryRow, b: HistoryRow) => a.date > b.date || (a.date === b.date && a.id > b.id)

/** The same calendar day `months` earlier, as `YYYY-MM-DD`, clamped to the month's last day. */
function monthsBefore(iso: string, months: number): string {
  const [y = 0, m = 1, d = 1] = iso.split('-').map(Number)
  const last = new Date(Date.UTC(y, m - 1 - months + 1, 0))
  return new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), Math.min(d, last.getUTCDate()))).toISOString().slice(0, 10)
}

const localToday = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/** Highest count wins, a tie goes to the more recent. `rows` is every row behind one candidate. */
function pickMost<K>(groups: Map<K, HistoryRow[]>): { key: K; rows: HistoryRow[]; runnerUp: number } {
  const ranked = [...groups.entries()].map(([key, rows]) => ({ key, rows, newest: rows.reduce((a, b) => (isNewer(b, a) ? b : a)) }))
  ranked.sort((a, b) => b.rows.length - a.rows.length || (isNewer(b.newest, a.newest) ? 1 : -1))
  const [first, second] = ranked as [(typeof ranked)[number], (typeof ranked)[number] | undefined]
  return { key: first.key, rows: first.rows, runnerUp: second?.rows.length ?? 0 }
}

const groupBy = <K>(rows: readonly HistoryRow[], by: (r: HistoryRow) => K): Map<K, HistoryRow[]> => {
  const groups = new Map<K, HistoryRow[]>()
  for (const r of rows) {
    const held = groups.get(by(r))
    if (held) held.push(r)
    else groups.set(by(r), [r])
  }
  return groups
}

const newestOf = (rows: readonly HistoryRow[]) => rows.reduce((a, b) => (isNewer(b, a) ? b : a))

/** The most common category among rows that carry one, a tie to the more recent. Null when none does. */
function usualCategory(rows: readonly HistoryRow[]): number | null {
  const categorised = rows.filter((r) => r.categoryId !== null)
  return categorised.length === 0 ? null : pickMost(groupBy(categorised, (r) => r.categoryId)).key
}

/** One merchant's history from all its typed rows. */
function readMerchant(all: readonly HistoryRow[], since: string): MerchantHistory {
  const recent = all.filter((r) => r.date >= since)
  if (recent.length < MIN_SIGHTINGS) {
    // Too little recent history to read a habit, so the newest row speaks, as it did before. It is still settled when
    // every row the person typed for this merchant, in the window or not, carries one description: nothing is mixed, the
    // history is only old. Rows that differ and are too few to vote leave the choice to the person.
    const newest = newestOf(all)
    const sameThroughout = new Set(all.map((r) => foldTitle(r.description))).size === 1
    return { sightings: all.length, label: newest.description.trim(), categoryId: newest.categoryId, settled: all.length >= MIN_SIGHTINGS && sameThroughout }
  }
  const top = pickMost(groupBy(recent, (r) => foldTitle(r.description)))
  return {
    sightings: all.length,
    label: newestOf(top.rows).description.trim(),
    categoryId: usualCategory(top.rows),
    // Two or more rows vote here, so a winner with a single row has a rival with one too and fails the strict lead: the
    // winner being typed at least twice is implied by leading strictly.
    settled: top.rows.length > top.runnerUp,
  }
}

/**
 * What each merchant's description and category should be, from the typed rows. A person may type a different
 * description once for a recurring merchant, and that must not become the suggestion, so the description is the one
 * they give most often, not the newest. Only the rows the app holds are counted, which are the signed-in person's own.
 *
 * Descriptions are compared folded (case and accents), and the label is the latest spelling of the winner. Only rows
 * within `DESCRIPTION_WINDOW_MONTHS` of `today` vote, so that a rename which has since become the habit takes over. A
 * merchant with fewer than two rows in that window has no habit to read and falls back to its newest row. The category
 * is the most common one among the winning description's rows that carry one, so the pair belongs together. Ties go to
 * the more recent in both choices.
 */
export function buildMerchantIndex(rows: readonly HistoryRow[], today: string = localToday()): MerchantIndex {
  const since = monthsBefore(today, DESCRIPTION_WINDOW_MONTHS)
  const typed = rows.filter((r) => !r.cancelled && r.type === 'expense')
  const index = new Map<string, MerchantHistory>()
  for (const [key, all] of groupBy(typed, (r) => merchantKey(r.description))) {
    if (key !== '') index.set(key, readMerchant(all, since))
  }
  return index
}

const NONE: MerchantHistory = { sightings: 0, label: null, categoryId: null, settled: false }

/** What the typed rows say about a merchant named in bank text: how often, and the person's usual description and category. */
export function merchantHistory(index: MerchantIndex, bankText: string | null): MerchantHistory {
  const key = bankText === null ? '' : merchantKey(bankText)
  return (key === '' ? undefined : index.get(key)) ?? NONE
}

/** What the recommendation's two instants say about when the payment happened, in the phone's own clock. */
export interface PaymentClock {
  /** Minutes since the phone's midnight, or null when the phone's offset or day is unknown. */
  minuteOfDay: number | null
  /** `HH:MM` on the phone's clock, or null when unknown. */
  time: string | null
  /** The phone's calendar day the push reached the server on, or null when the offset is unknown. */
  arrivedDate: string | null
  /** `HH:MM` on the phone's clock when it did, or null. */
  arrivedTime: string | null
}

const WITH_OFFSET = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):\d{2}(?:\.\d+)?([+-])(\d{2}):(\d{2})$/

/**
 * Reads the phone's own time of day from `occurredAt`, which the Worker writes with the phone's offset, never `Z`. A
 * row in UTC, or whose day is not `localDate`, has no known phone clock. Nothing here reads this device's zone, so a
 * device in another zone than the payment reads the same.
 */
export function paymentClock(occurredAt: string, localDate: string, createdAt: string): PaymentClock {
  const m = WITH_OFFSET.exec(occurredAt)
  if (!m || m[1] !== localDate) return { minuteOfDay: null, time: null, arrivedDate: null, arrivedTime: null }
  const offset = (m[4] === '-' ? -1 : 1) * (Number(m[5]) * 60 + Number(m[6]))
  const arrivedMs = Date.parse(createdAt)
  const arrived = Number.isNaN(arrivedMs) ? null : new Date(arrivedMs + offset * 60_000).toISOString()
  return {
    minuteOfDay: Number(m[2]) * 60 + Number(m[3]),
    time: `${m[2]}:${m[3]}`,
    arrivedDate: arrived?.slice(0, 10) ?? null,
    arrivedTime: arrived?.slice(11, 16) ?? null,
  }
}

/** How far either side of a payment's own time a bank may book it, in minutes. Pushes ran up to half an hour late. */
export const EDGE_MINUTES = 60

/** The calendar day `days` away from `iso`. */
export function shiftDay(iso: string, days: number): string {
  const [y = 0, m = 1, d = 1] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/**
 * Every day a bank might book the payment on: its own day, the day before or after when it is within `EDGE_MINUTES`
 * of midnight (both when its time is unknown), and the day its push arrived, since a late push is a late payment too.
 */
export function bookingDates(localDate: string, minuteOfDay: number | null, arrivedDate: string | null): string[] {
  const dates = new Set([localDate])
  if (minuteOfDay === null || minuteOfDay < EDGE_MINUTES) dates.add(shiftDay(localDate, -1))
  if (minuteOfDay === null || minuteOfDay >= 24 * 60 - EDGE_MINUTES) dates.add(shiftDay(localDate, 1))
  if (arrivedDate !== null) dates.add(arrivedDate)
  return [...dates]
}

/**
 * The days a payment might be booked on that fall in another budget month than its own day does. `monthOf` is the
 * rule the add form uses, so the calendar month end, the user's rollover day and a settled statement are all one
 * rule here: whatever moves the budget month moves it for a day an hour away too. Empty means the budget month is
 * the same whichever of those days the bank picks.
 */
export function otherBudgetDays(
  monthOf: (isoDate: string) => string,
  localDate: string,
  minuteOfDay: number | null,
  arrivedDate: string | null,
): string[] {
  const own = monthOf(localDate)
  return bookingDates(localDate, minuteOfDay, arrivedDate).filter((day) => day !== localDate && monthOf(day) !== own)
}

export type ReviewReason =
  | 'no-amount'
  | 'zero-amount'
  | 'no-merchant'
  | 'no-category'
  | 'no-account'
  | 'foreign'
  | 'own-money'
  | 'month-edge'
  | 'possible-match'
  | 'new-merchant'
  | 'mixed-description'

/** What the payment is known to be, as far as the app can tell. */
export interface ReviewFacts {
  amountCents: number | null
  currency: string | null
  hasMerchant: boolean
  categoryId: number | null
  accountId: number | null
  suggestedType: SuggestedType | null
  sightings: number
  /** The person's usual description for the merchant is settled: see `MerchantHistory.settled`. */
  settled: boolean
  /** The budget month could differ: see `otherBudgetDays`. */
  monthEdge: boolean
  /** A typed row that looks the same, when the server says so. Absent until it does. */
  possibleMatch: boolean
}

/** Each reason a payment needs a look, in the order they are shown, with the test that finds it. */
const RULES: ReadonlyArray<readonly [ReviewReason, (f: ReviewFacts) => boolean]> = [
  ['no-amount', (f) => f.amountCents === null],
  ['zero-amount', (f) => f.amountCents !== null && f.amountCents <= 0],
  ['no-merchant', (f) => !f.hasMerchant],
  ['no-category', (f) => f.categoryId === null],
  ['no-account', (f) => f.accountId === null],
  ['foreign', (f) => f.currency !== null && f.currency !== 'EUR'],
  // An investment is a move of the user's own money, picked by them: one tap never makes one.
  ['own-money', (f) => f.suggestedType === null || f.suggestedType === 'investment'],
  ['month-edge', (f) => f.monthEdge],
  ['possible-match', (f) => f.possibleMatch],
  ['new-merchant', (f) => f.hasMerchant && f.sightings < MIN_SIGHTINGS],
  // Not for a new merchant, which already says so: this is for one the person has typed more than one way.
  ['mixed-description', (f) => f.hasMerchant && f.sightings >= MIN_SIGHTINGS && !f.settled],
]

/** Why a payment needs a look before it is added. Empty means one tap may add it. */
export function reviewReasons(f: ReviewFacts): ReviewReason[] {
  return RULES.filter(([, applies]) => applies(f)).map(([reason]) => reason)
}

export const REVIEW_TEXT: Record<ReviewReason, string> = {
  'no-amount': 'Amount missing',
  'zero-amount': 'Amount is zero',
  'no-merchant': 'No merchant',
  'no-category': 'Category not set',
  'no-account': 'Account not set',
  foreign: 'Not in euros',
  'own-money': 'Your own money moved',
  'month-edge': 'Budget month could differ',
  'possible-match': 'May be entered already',
  'new-merchant': 'New merchant',
  'mixed-description': 'Description not settled',
}
