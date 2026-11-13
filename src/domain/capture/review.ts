import { foldTitle } from './text'
import type { SuggestedType } from './types'

/** How many typed rows a merchant needs before one tap may add its payment without a look. */
export const MIN_SIGHTINGS = 2

/** What a person's own history says about a merchant, from the rows the app holds. */
export interface MerchantHistory {
  /** Typed expenses that carry this merchant's name. */
  sightings: number
  /** The newest such row's description, the way the person spells it. */
  label: string | null
  /** The newest such row's category. */
  categoryId: number | null
}

/** The part of a typed row the history reads. */
export interface HistoryRow {
  id: number
  date: string
  description: string
  type: string
  categoryId: number
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

/** Every merchant in the typed rows at once, so a list of payments is described in one pass over the rows. */
export type MerchantIndex = ReadonlyMap<string, MerchantHistory & { newest: HistoryRow }>

export function buildMerchantIndex(rows: readonly HistoryRow[]): MerchantIndex {
  const index = new Map<string, MerchantHistory & { newest: HistoryRow }>()
  for (const row of rows) {
    if (row.cancelled || row.type !== 'expense') continue
    const key = merchantKey(row.description)
    if (key === '') continue
    const held = index.get(key)
    const newer = !held || row.date > held.newest.date || (row.date === held.newest.date && row.id > held.newest.id)
    const newest = newer ? row : held.newest
    index.set(key, { sightings: (held?.sightings ?? 0) + 1, label: newest.description.trim(), categoryId: newest.categoryId, newest })
  }
  return index
}

const NONE: MerchantHistory = { sightings: 0, label: null, categoryId: null }

/** What the typed rows say about a merchant named in bank text: how often, and the newest row's spelling and category. */
export function merchantHistory(index: MerchantIndex, bankText: string | null): MerchantHistory {
  const key = bankText === null ? '' : merchantKey(bankText)
  const found = key === '' ? undefined : index.get(key)
  return found ? { sightings: found.sightings, label: found.label, categoryId: found.categoryId } : NONE
}

/** When a payment landed, as far as the push says, in the viewer's own clock. */
export interface PaymentMoment {
  /** The payment's local date, `YYYY-MM-DD`. */
  localDate: string
  /** The hour (0 to 23) the push is stamped with, or null when it cannot be read in the payment's own day. */
  hour: number | null
  /** The month the push reached the server, `YYYY-MM`. */
  arrivedMonth: string
}

function daysInMonth(yearMonth: string): number {
  const [year = 0, month = 1] = yearMonth.split('-').map(Number)
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/**
 * Whether the date, and so the budget month, could be read two ways: the payment is in the last hour of a month or the
 * first hour of the next, or the push reached the server in a later month than the one it is dated in. A bank may book
 * such a payment on the other side of the line.
 */
export function nearMonthEdge({ localDate, hour, arrivedMonth }: PaymentMoment): boolean {
  const month = localDate.slice(0, 7)
  const day = Number(localDate.slice(8, 10))
  if (arrivedMonth > month || hour === null) return true
  if (day === daysInMonth(month) && hour >= 23) return true
  return day === 1 && hour < 1
}

export type ReviewReason =
  | 'no-amount'
  | 'no-merchant'
  | 'no-category'
  | 'no-account'
  | 'foreign'
  | 'own-money'
  | 'month-edge'
  | 'possible-match'
  | 'new-merchant'

/** What the payment is known to be, as far as the app can tell. */
export interface ReviewFacts {
  amountCents: number | null
  currency: string | null
  hasMerchant: boolean
  categoryId: number | null
  accountId: number | null
  suggestedType: SuggestedType | null
  sightings: number
  monthEdge: boolean
  /** A typed row that looks the same, when the server says so. Absent until it does. */
  possibleMatch: boolean
}

/** Why a payment needs a look before it is added. Empty means one tap may add it. */
export function reviewReasons(f: ReviewFacts): ReviewReason[] {
  const out: ReviewReason[] = []
  if (f.amountCents === null) out.push('no-amount')
  if (!f.hasMerchant) out.push('no-merchant')
  if (f.categoryId === null) out.push('no-category')
  if (f.accountId === null) out.push('no-account')
  if (f.currency !== null && f.currency !== 'EUR') out.push('foreign')
  if (f.suggestedType === null) out.push('own-money')
  if (f.monthEdge) out.push('month-edge')
  if (f.possibleMatch) out.push('possible-match')
  if (f.sightings < MIN_SIGHTINGS && f.hasMerchant) out.push('new-merchant')
  return out
}

export const REVIEW_TEXT: Record<ReviewReason, string> = {
  'no-amount': 'Amount missing',
  'no-merchant': 'No merchant',
  'no-category': 'Category not set',
  'no-account': 'Account not set',
  foreign: 'Not in euros',
  'own-money': 'Your own money moved',
  'month-edge': 'Near month end',
  'possible-match': 'May be entered already',
  'new-merchant': 'New merchant',
}
