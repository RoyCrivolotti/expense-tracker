import type {
  NewRecommendation,
  OpenSummary,
  Recommendation,
  RecommendationState,
} from '../../../src/domain/ports/captureRepository'
import { EVENT_HAS_TEXT, EVENT_TEXT_SET } from './captureEventsSql'

const COLUMNS = `id, owner, account_id, amount_cents, currency, occurred_at, local_date, merchant_raw,
description_suggested, suggested_type, state, txn_id, created_at, decided_at`

export const CREATE_RECOMMENDATION_SQL = `INSERT INTO recommendations
(id, owner, account_id, amount_cents, currency, occurred_at, local_date, merchant_raw, description_suggested,
 suggested_type, created_at)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`

export const GET_RECOMMENDATION_SQL = `SELECT ${COLUMNS} FROM recommendations WHERE owner = ?1 AND id = ?2`

/** Newest day first. The index ends in the id, so a page is read in this order with no sort. */
export const LIST_OPEN_FIRST_SQL = `SELECT ${COLUMNS} FROM recommendations
WHERE owner = ?1 AND state = 'open' ORDER BY local_date DESC, id DESC LIMIT ?2`

export const LIST_OPEN_AFTER_SQL = `SELECT ${COLUMNS} FROM recommendations
WHERE owner = ?1 AND state = 'open' AND (local_date < ?3 OR (local_date = ?3 AND id < ?4))
ORDER BY local_date DESC, id DESC LIMIT ?2`

export const COUNT_OPEN_SQL = `SELECT COUNT(*) AS n FROM recommendations WHERE owner = ?1 AND state = 'open'`

/** The count, and what is needed to say a total only when it is honest: one currency, every amount known. */
export const SUMMARIZE_OPEN_SQL = `SELECT COUNT(*) AS n, SUM(amount_cents) AS total, COUNT(DISTINCT currency) AS currencies,
  SUM(amount_cents IS NULL OR currency IS NULL) AS unknown, MIN(currency) AS currency, MIN(id) AS only_id
FROM recommendations WHERE owner = ?1 AND state = 'open'`

/** Only an open row moves, so a second tap or a retry finds nothing to change. */
export const DECIDE_SQL = `UPDATE recommendations SET state = ?3, txn_id = ?4, decided_at = ?5
WHERE owner = ?1 AND id = ?2 AND state = 'open'`

/**
 * Run with `DECIDE_SQL`: once the person has decided, the push's text has done its job. Harmless when the decide
 * changed nothing, since a recommendation that is not open had its text blanked when it was decided.
 */
export const BLANK_DECIDED_TEXT_SQL = `UPDATE capture_events SET ${EVENT_TEXT_SET}
WHERE owner = ?1 AND rec_id = ?2 AND ${EVENT_HAS_TEXT}`

export interface RecommendationRow {
  id: string
  owner: string
  account_id: number | null
  amount_cents: number | null
  currency: string | null
  occurred_at: string
  local_date: string
  merchant_raw: string | null
  description_suggested: string | null
  suggested_type: string | null
  state: string
  txn_id: number | null
  created_at: string
  decided_at: string | null
}

export function createParams(r: NewRecommendation): Array<string | number | null> {
  return [
    r.id,
    r.owner,
    r.accountId,
    r.amountCents,
    r.currency,
    r.occurredAt,
    r.localDate,
    r.merchantRaw,
    r.descriptionSuggested,
    r.suggestedType,
    r.createdAt,
  ]
}

export function toRecommendation(row: RecommendationRow): Recommendation {
  return {
    id: row.id,
    owner: row.owner,
    accountId: row.account_id,
    amountCents: row.amount_cents,
    currency: row.currency,
    occurredAt: row.occurred_at,
    localDate: row.local_date,
    merchantRaw: row.merchant_raw,
    descriptionSuggested: row.description_suggested,
    suggestedType: row.suggested_type as Recommendation['suggestedType'],
    state: row.state as RecommendationState,
    txnId: row.txn_id,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
  }
}

export interface OpenSummaryRow {
  n: number
  total: number | null
  currencies: number
  unknown: number
  currency: string | null
  only_id: string | null
}

export function toOpenSummary(row: OpenSummaryRow | null): OpenSummary {
  const count = row?.n ?? 0
  const whole = row !== null && count > 0 && row.currencies === 1 && !row.unknown
  return {
    count,
    totalCents: whole ? row.total : null,
    currency: whole ? row.currency : null,
    onlyId: count === 1 ? (row?.only_id ?? null) : null,
  }
}
