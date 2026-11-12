import type { NewTransaction } from '../data/dataSource'
import type { CaptureRepository, Recommendation, RecommendationCursor } from '../ports/captureRepository'
import type { ExpenseRepository } from '../ports/expenseRepository'
import type { Transaction } from '../types'
import { createTransaction } from './transactionService'
import { ValidationError } from './validationError'

/** The most rows one page of the open list returns. */
export const MAX_RECOMMENDATION_PAGE = 100
export const DEFAULT_RECOMMENDATION_PAGE = 50

/** Recommendation ids are UUIDs the Worker made. Anything else cannot be one. */
export const RECOMMENDATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Why a decision did not happen: there is no such recommendation for this person, or it was decided already. */
export type DecisionRefusal = 'missing' | 'decided'

export type Decision<T = object> = ({ ok: true } & T) | { ok: false; reason: DecisionRefusal }

export interface RecommendationPage {
  recommendations: Recommendation[]
  /** Where the next page starts, or null on the last page. */
  next: RecommendationCursor | null
  openCount: number
}

export function parsePageLimit(raw: string | null): number {
  if (raw === null) return DEFAULT_RECOMMENDATION_PAGE
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1 || n > MAX_RECOMMENDATION_PAGE) {
    throw new ValidationError(`limit must be a whole number from 1 to ${MAX_RECOMMENDATION_PAGE}`)
  }
  return n
}

/** A cursor travels as `<local date>~<id>`. Both halves are checked, so a made-up one is a 400 and never reaches SQL. */
export function parseCursor(raw: string | null): RecommendationCursor | undefined {
  if (raw === null) return undefined
  const match = /^(\d{4}-\d{2}-\d{2})~([0-9a-f-]{36})$/.exec(raw)
  if (!match) throw new ValidationError('after is not a cursor this list gave')
  return { localDate: match[1]!, id: match[2]! }
}

export function formatCursor(c: RecommendationCursor): string {
  return `${c.localDate}~${c.id}`
}

/** One more row is read than asked for, which tells a last page from a full one without a second query. */
export async function listRecommendations(
  captures: CaptureRepository,
  owner: string,
  limit: number,
  after?: RecommendationCursor,
): Promise<RecommendationPage> {
  const [rows, openCount] = await Promise.all([
    captures.listOpenRecommendations(owner, limit + 1, after),
    captures.countOpenRecommendations(owner),
  ])
  const recommendations = rows.slice(0, limit)
  const last = recommendations[recommendations.length - 1]
  const next = rows.length > limit && last ? { localDate: last.localDate, id: last.id } : null
  return { recommendations, next, openCount }
}

async function openOne(captures: CaptureRepository, owner: string, id: string): Promise<Decision> {
  const rec = await captures.getRecommendation(owner, id)
  if (!rec) return { ok: false, reason: 'missing' }
  return rec.state === 'open' ? { ok: true } : { ok: false, reason: 'decided' }
}

/**
 * Creates the expense the person edited, through the ordinary create path, and marks the recommendation submitted.
 * The two writes cannot share a batch, so the recommendation is read first and, if a second tap decided it between
 * the read and the mark, the row just created is deleted again. The person's input is validated by the create path
 * before anything is written; nothing from the recommendation is trusted over what they sent.
 */
export async function submitRecommendation(
  captures: CaptureRepository,
  expenses: ExpenseRepository,
  owner: string,
  id: string,
  input: NewTransaction,
  now: Date,
): Promise<Decision<{ transaction: Transaction }>> {
  const open = await openOne(captures, owner, id)
  if (!open.ok) return open
  const transaction = await createTransaction(expenses, owner, input)
  const marked = await captures.decideRecommendation(owner, id, {
    state: 'submitted',
    txnId: transaction.id,
    at: now.toISOString(),
  })
  if (!marked) {
    await expenses.deleteTransaction(owner, transaction.id)
    return { ok: false, reason: 'decided' }
  }
  return { ok: true, transaction }
}

/** Marks the recommendation as already entered by hand. The row must be the person's own and not answer for another. */
export async function linkRecommendation(
  captures: CaptureRepository,
  expenses: ExpenseRepository,
  owner: string,
  id: string,
  transactionId: unknown,
  now: Date,
): Promise<Decision | { ok: false; reason: 'no-transaction' | 'taken' }> {
  if (!Number.isInteger(transactionId) || (transactionId as number) <= 0) {
    throw new ValidationError('transactionId must be a positive whole number')
  }
  const txnId = transactionId as number
  const open = await openOne(captures, owner, id)
  if (!open.ok) return open
  if (!(await expenses.getTransaction(owner, txnId))) return { ok: false, reason: 'no-transaction' }
  try {
    const marked = await captures.decideRecommendation(owner, id, { state: 'submitted', txnId, at: now.toISOString() })
    return marked ? { ok: true } : { ok: false, reason: 'decided' }
  } catch (error) {
    // The unique index: another recommendation already answers for this transaction. Any other failure is real.
    if (error instanceof Error && /UNIQUE/i.test(error.message)) return { ok: false, reason: 'taken' }
    throw error
  }
}

export async function dismissRecommendation(
  captures: CaptureRepository,
  owner: string,
  id: string,
  now: Date,
): Promise<Decision> {
  const open = await openOne(captures, owner, id)
  if (!open.ok) return open
  const marked = await captures.decideRecommendation(owner, id, { state: 'dismissed', at: now.toISOString() })
  return marked ? { ok: true } : { ok: false, reason: 'decided' }
}
