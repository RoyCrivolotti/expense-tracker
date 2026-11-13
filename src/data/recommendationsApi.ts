import type { NewTransaction } from './dataSource'
import type { Transaction } from '../types'
import { req } from './apiClient'

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
  /**
   * A row the person typed that looks like this payment, when the server says so. Not sent yet: the screen treats its
   * absence as "no match known", and its presence as a reason to look before adding.
   */
  /** The card the push showed: the bank app and the last four digits. Null for a push with no digits. */
  card?: { source: 'iberia' | 'santander'; digits: string } | null
  possibleMatch?: { id: number; description: string; date: string } | null
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

export const path = (id: string, action: string) => `/api/recommendations/${encodeURIComponent(id)}/${action}`

/** Creates the transaction the person edited and marks the recommendation done, in one request. */
export function submitRecommendation(id: string, input: NewTransaction): Promise<Transaction> {
  return req<Transaction>(path(id, 'submit'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
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
