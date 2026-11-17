import type { NewTransaction } from '../data/dataSource'
import { paymentOfRow, type PossibleMatch } from '../capture/duplicate'
import { learnFromAccept, learnFromDismiss, outcomeOf, pushHadDigits, storedSlots } from '../capture/learn'
import type { SavedRow } from '../capture/learn'
import type { CaptureRepository, Recommendation, RecommendationCursor } from '../ports/captureRepository'
import type { ExpenseRepository } from '../ports/expenseRepository'
import type { Transaction } from '../types'
import { createTransaction, validateNewTransaction } from './transactionService'
import { ValidationError } from './validationError'

/** The most rows one page of the open list returns. */
export const MAX_RECOMMENDATION_PAGE = 100
export const DEFAULT_RECOMMENDATION_PAGE = 50

/** Recommendation ids are UUIDs the Worker made. Anything else cannot be one. */
export const RECOMMENDATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Why a decision did not happen: there is no such recommendation for this person, or it was decided already. */
export type DecisionRefusal = 'missing' | 'decided'

/** A submit refused because a typed row already looks like this payment and the person has not said to add it anyway. */
export interface DuplicateRefusal {
  ok: false
  reason: 'possible-duplicate'
  possibleMatch: PossibleMatch
}

export type Decision<T = object> = ({ ok: true } & T) | { ok: false; reason: DecisionRefusal }

export interface RecommendationPage {
  recommendations: Recommendation[]
  /** Where the next page starts, or null on the last page. */
  next: RecommendationCursor | null
  openCount: number
}

export function parsePageLimit(raw: string | null): number {
  if (raw === null) return DEFAULT_RECOMMENDATION_PAGE
  const n = /^\d+$/.test(raw) ? Number(raw) : NaN
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

async function openOne(captures: CaptureRepository, owner: string, id: string): Promise<Decision<{ rec: Recommendation }>> {
  const rec = await captures.getRecommendation(owner, id)
  if (!rec) return { ok: false, reason: 'missing' }
  return rec.state === 'open' ? { ok: true, rec } : { ok: false, reason: 'decided' }
}

function savedRow(t: Pick<Transaction, 'amountCents' | 'type' | 'accountId'>): SavedRow {
  return { amountCents: t.amountCents, type: t.type, accountId: t.accountId }
}

/**
 * Teaches the template of the push behind a recommendation what the person just decided, and records the outcome on
 * the push. Called only after this request's decide changed the row, so a retry that lost the race teaches nothing.
 * `rec` is the recommendation as it was shown before the decision. Best
 * effort: the decision has been made whatever happens here, so a failure is logged by its class alone (a message
 * could quote the push) and the request still succeeds.
 */
export async function learnAfterDecision(
  captures: CaptureRepository,
  owner: string,
  rec: Recommendation,
  decision: { kind: 'submitted' | 'linked'; saved: SavedRow } | { kind: 'dismissed' },
  now: Date,
): Promise<void> {
  try {
    const event = await captures.eventOfRecommendation(owner, rec.id)
    if (!event) return
    const { facts, templateId } = event
    const outcome = outcomeOf(rec, decision.kind === 'submitted' ? decision.saved : decision.kind)
    if (facts === null || templateId === null) {
      await captures.applyDecisionLearning(owner, rec.id, null, outcome)
      return
    }
    const slots = storedSlots(event.slots)
    const learned =
      decision.kind === 'dismissed'
        ? learnFromDismiss(facts, now.toISOString())
        : learnFromAccept(facts, slots, decision.saved, pushHadDigits(event.last4, slots))
    await captures.applyDecisionLearning(owner, rec.id, { templateId, facts: learned }, outcome)
  } catch (error) {
    console.error('capture: learning failed', error instanceof Error ? error.name : 'unknown')
  }
}

/**
 * Creates the expense the person edited, through the ordinary create path, and marks the recommendation submitted.
 * The two writes cannot share a batch, so the row just created is deleted again whenever the mark does not happen:
 * a second tap decided it in between, or the mark failed. A failed delete is logged and the original failure is still
 * the one thrown. The person's input is validated by the create path before anything is written; nothing from the
 * recommendation is trusted over what they sent.
 */
export async function submitRecommendation(
  captures: CaptureRepository,
  expenses: ExpenseRepository,
  owner: string,
  id: string,
  input: NewTransaction,
  now: Date,
  allowDuplicate = false,
): Promise<Decision<{ transaction: Transaction }> | DuplicateRefusal> {
  const open = await openOne(captures, owner, id)
  if (!open.ok) return open
  if (!allowDuplicate) {
    // Checked after validation so a malformed body is still a 400, and before anything is written so a refusal
    // leaves nothing behind. The row looked for is the one being submitted, which is the payment unless the person
    // changed it. A row typed after the list was read is caught here; one typed between this read and the insert is not.
    const valid = validateNewTransaction(input)
    const possibleMatch = await captures.findPossibleMatch(owner, paymentOfRow(valid))
    if (possibleMatch) return { ok: false, reason: 'possible-duplicate', possibleMatch }
  }
  const transaction = await createTransaction(expenses, owner, input)
  let marked: boolean
  try {
    marked = await captures.decideRecommendation(owner, id, {
      state: 'submitted',
      txnId: transaction.id,
      at: now.toISOString(),
    })
  } catch (error) {
    await removeQuietly(expenses, owner, transaction.id)
    throw error
  }
  if (!marked) {
    await expenses.deleteTransaction(owner, transaction.id)
    return { ok: false, reason: 'decided' }
  }
  await learnAfterDecision(captures, owner, open.rec, { kind: 'submitted', saved: savedRow(transaction) }, now)
  return { ok: true, transaction }
}

async function removeQuietly(expenses: ExpenseRepository, owner: string, id: number): Promise<void> {
  try {
    await expenses.deleteTransaction(owner, id)
  } catch (error) {
    console.error('could not remove an expense whose recommendation was not marked', error)
  }
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
  const linked = await expenses.getTransaction(owner, txnId)
  if (!linked) return { ok: false, reason: 'no-transaction' }
  let marked: boolean
  try {
    marked = await captures.decideRecommendation(owner, id, { state: 'submitted', txnId, at: now.toISOString() })
  } catch (error) {
    // The unique index: another recommendation already answers for this transaction. D1 reports it only as message
    // text, so that is what is matched; any other failure is real and is thrown.
    if (error instanceof Error && /UNIQUE/i.test(error.message)) return { ok: false, reason: 'taken' }
    throw error
  }
  if (!marked) return { ok: false, reason: 'decided' }
  await learnAfterDecision(captures, owner, open.rec, { kind: 'linked', saved: savedRow(linked) }, now)
  return { ok: true }
}

export async function dismissRecommendation(
  captures: CaptureRepository,
  owner: string,
  id: string,
  now: Date,
): Promise<Decision> {
  const open = await openOne(captures, owner, id)
  if (!open.ok) return open
  if (!(await captures.decideRecommendation(owner, id, { state: 'dismissed', at: now.toISOString() }))) {
    return { ok: false, reason: 'decided' }
  }
  await learnAfterDecision(captures, owner, open.rec, { kind: 'dismissed' }, now)
  return { ok: true }
}
