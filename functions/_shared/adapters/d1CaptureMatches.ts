import type { Recommendation } from '../../../src/domain/ports/captureRepository'
import {
  candidateSpan,
  possibleMatchesFor,
  possibleMatchFor,
  type PaymentToMatch,
  type PossibleMatch,
  type TypedRow,
} from '../../../src/domain/capture/duplicate'
import { MATCH_CANDIDATES_SQL } from '../capture/captureMatchesSql'
import { rows } from './d1CaptureSupport'

interface CandidateRow {
  id: number
  date: string
  description: string
  type: string
  amount_cents: number
}

function toTypedRow(r: CandidateRow): TypedRow {
  return { id: r.id, date: r.date, description: r.description, type: r.type, amountCents: r.amount_cents }
}

/**
 * The typed row one payment may duplicate, for the submit-time check: the same read as `withMatches` with one amount
 * and one date, so it walks `idx_txn_owner_date` over at most the match window, and the same `possibleMatchFor`
 * chooses the row. Null without a read when the payment cannot be matched.
 */
export async function findMatch(
  db: D1Database,
  owner: string,
  payment: PaymentToMatch,
): Promise<PossibleMatch | null> {
  const span = candidateSpan([payment])
  if (!span || payment.amountCents === null) return null
  const candidates = (
    await rows<CandidateRow>(db, MATCH_CANDIDATES_SQL, owner, span.from, span.to, JSON.stringify([payment.amountCents]))
  ).map(toTypedRow)
  return possibleMatchFor(payment, candidates)
}

/** A payment as the person will see it: the suggested amount and type when there is a suggestion. */
const asShown = (r: Recommendation): Recommendation =>
  r.suggestion ? { ...r, amountCents: r.suggestion.amountCents, suggestedType: r.suggestion.type } : r

/**
 * Adds the typed row each recommendation of a page may duplicate. One read for the whole page, however many payments
 * it holds, and none when no payment on it can be matched. The candidates of every payment come back together and
 * `possibleMatchesFor` gives each row to one payment. Each payment is matched as it is shown (`asShown`).
 */
export async function withMatches(
  db: D1Database,
  owner: string,
  page: Recommendation[],
): Promise<Recommendation[]> {
  const shown = page.map(asShown)
  const span = candidateSpan(shown)
  if (!span) return page.map((r) => ({ ...r, possibleMatch: null }))
  const amounts = [...new Set(shown.flatMap((r) => (r.amountCents === null ? [] : [r.amountCents])))]
  const candidates: TypedRow[] = (
    await rows<CandidateRow>(db, MATCH_CANDIDATES_SQL, owner, span.from, span.to, JSON.stringify(amounts))
  ).map(toTypedRow)
  const matches = possibleMatchesFor(shown, candidates)
  return page.map((r) => ({ ...r, possibleMatch: matches.get(r.id) ?? null }))
}
