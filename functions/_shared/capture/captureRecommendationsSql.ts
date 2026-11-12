import type {
  NewRecommendation,
  Recommendation,
  RecommendationState,
} from '../../../src/domain/ports/captureRepository'

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

/** Only an open row moves, so a second tap or a retry finds nothing to change. */
export const DECIDE_SQL = `UPDATE recommendations SET state = ?3, txn_id = ?4, decided_at = ?5
WHERE owner = ?1 AND id = ?2 AND state = 'open'`

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
