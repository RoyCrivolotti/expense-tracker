import type { NewTransaction } from './dataSource'
import type { Transaction } from '../types'
import { ApiError, req } from './apiClient'
import type { PossibleMatch } from '../domain/capture/duplicate'
import type { Suggestion } from '../domain/capture/suggestion'

/** A push the app turned into something to review, as the list route sends it. Nothing here is an expense yet. */
export interface RecommendationInfo {
  id: string
  accountId: number | null
  /** Positive cents, or null when the push gave no amount. */
  amountCents: number | null
  currency: string | null
  localDate: string
  occurredAt: string
  /** When the push reached the server. */
  createdAt: string
  merchantRaw: string | null
  descriptionSuggested: string | null
  /** Null where the person has to pick, as for the two legs of a move between their own accounts. */
  suggestedType: 'expense' | 'income' | 'investment' | 'refund' | null
  /** The card the push showed: the bank app and the last four digits. Null for a push with no digits. */
  card?: { source: string; digits: string } | null
  /**
   * A row that looks like this payment: the same direction and price, from 14 days before to 3 days after, or to 7
   * days after for an announced bill and the row that answers for its charge. A reason to look before adding, and the
   * row Link points the payment at.
   */
  possibleMatch?: PossibleMatch | null
  /**
   * What the person's own decisions on earlier pushes say the payment becomes: their description and category for the
   * merchant, the type, account and amount the push's wording taught. Null for a recommendation no push made.
   */
  suggestion?: Suggestion | null
  /** The bank's own text of the push behind it, or null when there is none or it has been blanked. */
  message?: string | null
  /** False when `merchantRaw` is a whole message or absent, not a merchant: the payment has no name of the bank's. */
  named?: boolean
}

/** The typed row a payment may duplicate. */
export type { PossibleMatch }

/** The server refused a submit because a typed row already looks like the payment. Nothing was created. */
export class PossibleDuplicateError extends Error {
  readonly possibleMatch: PossibleMatch
  constructor(possibleMatch: PossibleMatch) {
    super('A typed row already looks like this payment')
    this.name = 'PossibleDuplicateError'
    this.possibleMatch = possibleMatch
  }
}

/** The amount, type and account of the row, each kept only when the server sent one of the right kind. */
function rowDetail(m: Partial<PossibleMatch>): Partial<PossibleMatch> {
  return {
    ...(typeof m.amountCents === 'number' ? { amountCents: m.amountCents } : {}),
    ...(typeof m.type === 'string' ? { type: m.type } : {}),
    ...(typeof m.accountId === 'number' ? { accountId: m.accountId } : {}),
  }
}

function duplicateOf(error: unknown): PossibleMatch | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null
  const body = error.body as { code?: unknown; possibleMatch?: Partial<PossibleMatch> } | undefined
  const m = body?.possibleMatch
  if (body?.code !== 'possible-duplicate' || !m || typeof m.transactionId !== 'number') return null
  return {
    transactionId: m.transactionId,
    description: String(m.description ?? ''),
    date: String(m.date ?? ''),
    ...rowDetail(m),
  }
}

export interface RecommendationPage {
  recommendations: RecommendationInfo[]
  next: string | null
  openCount: number
}

/** The most the screen reads at once. The route allows 100. */
const PAGE = 50

export function fetchRecommendations(after?: string): Promise<RecommendationPage> {
  const query = new URLSearchParams({ limit: String(PAGE) })
  if (after) query.set('after', after)
  return req<RecommendationPage>(`/api/recommendations?${query}`)
}

export const path = (
  id: string,
  action: string,
) => `/api/recommendations/${encodeURIComponent(id)}/${action}`

/**
 * Creates the transaction the person edited and marks the recommendation done, in one request. Rejects with
 * `PossibleDuplicateError`, and nothing created, when a typed row already looks like it; `allowDuplicate` adds it anyway.
 */
export async function submitRecommendation(
  id: string,
  input: NewTransaction,
  allowDuplicate = false,
): Promise<Transaction> {
  try {
    return await req<Transaction>(path(id, 'submit'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(allowDuplicate ? { ...input, allowDuplicate: true } : input),
    })
  } catch (error) {
    const match = duplicateOf(error)
    throw match ? new PossibleDuplicateError(match) : error
  }
}

const changes = new EventTarget()

/** Tells an open list that a recommendation was decided somewhere else, such as in the add form. */
export function announceRecommendationsChanged(): void {
  changes.dispatchEvent(new Event('changed'))
}

export function onRecommendationsChanged(listener: () => void): () => void {
  changes.addEventListener('changed', listener)
  return () => changes.removeEventListener('changed', listener)
}

let holds = 0
let owed = false

/**
 * Reads the open list again, for a refresh the person asked for or a sign that something new arrived. The one call for
 * any caller that wants the list to be current, so a shell around the app can make it too. While a form or sheet is
 * open on a payment (`holdRecommendationReloads`) the read waits and happens once when the last of them closes, so a
 * row is never pulled from under the person.
 */
export function reloadRecommendations(): void {
  if (holds > 0) owed = true
  else announceRecommendationsChanged()
}

/** Postpones `reloadRecommendations` until the returned release is called. Holds stack. */
export function holdRecommendationReloads(): () => void {
  holds += 1
  let released = false
  return () => {
    if (released) return
    released = true
    holds -= 1
    if (holds === 0 && owed) {
      owed = false
      announceRecommendationsChanged()
    }
  }
}
