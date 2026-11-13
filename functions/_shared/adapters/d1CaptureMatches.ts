import type { Recommendation } from '../../../src/domain/ports/captureRepository'
import { candidateSpan, possibleMatchFor, type TypedRow } from '../../../src/domain/capture/duplicate'
import { MATCH_CANDIDATES_SQL } from '../capture/captureMatchesSql'
import { rows } from './d1CaptureSupport'

interface CandidateRow {
  id: number
  date: string
  description: string
  type: string
  amount_cents: number
}

/**
 * Adds the typed row each recommendation of a page may duplicate. One read for the whole page, however many payments
 * it holds, and none when no payment on it can be matched. The candidates of every payment come back together and
 * `possibleMatchFor` picks each payment's own.
 */
export async function withMatches(db: D1Database, owner: string, page: Recommendation[]): Promise<Recommendation[]> {
  const span = candidateSpan(page)
  if (!span) return page.map((r) => ({ ...r, possibleMatch: null }))
  const amounts = [...new Set(page.flatMap((r) => (r.amountCents === null ? [] : [r.amountCents])))]
  const candidates: TypedRow[] = (
    await rows<CandidateRow>(db, MATCH_CANDIDATES_SQL, owner, span.from, span.to, JSON.stringify(amounts))
  ).map((r) => ({ id: r.id, date: r.date, description: r.description, type: r.type, amountCents: r.amount_cents }))
  return page.map((r) => ({ ...r, possibleMatch: possibleMatchFor(r, candidates) }))
}
