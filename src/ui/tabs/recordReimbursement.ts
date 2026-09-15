import type { NewTransaction } from '../../data/dataSource'
import type { ExpenseActions } from '../actions'

/**
 * Record a reimbursement and mark what it covered.
 *
 * Two calls rather than one endpoint, because both already exist and are
 * owner-scoped: create the `refund`, then stamp the rows it settles. If the stamp
 * fails the refund is deleted again — the same compensating-delete shape
 * `createPlanAndLink` uses. Deleting a refund also clears `settled_by` on every row
 * pointing at it, so a rollback that succeeds undoes a partial stamp too.
 *
 * When the rollback itself fails, nothing can be claimed about what survived; see
 * `reimbursementFailureCopy`.
 *
 * The refund itself carries **no flag**. The rows it settles leave the Flagged
 * card on their own, and a flagged refund would then subtract a second time —
 * the claim would read as over-paid by its own settlement.
 */
/**
 * A settle step that failed after the refund was created. Carries the only fact the
 * caller can act on: whether the compensating delete is *known* to have run.
 */
export class ReimbursementSettleError extends Error {
  readonly rolledBack: boolean
  readonly status: number | undefined

  constructor(cause: unknown, rolledBack: boolean) {
    super(cause instanceof Error ? cause.message : 'Could not record the reimbursement')
    this.name = 'ReimbursementSettleError'
    this.rolledBack = rolledBack
    this.status =
      cause !== null && typeof cause === 'object' && typeof (cause as { status?: unknown }).status === 'number'
        ? (cause as { status: number }).status
        : undefined
  }
}

/**
 * What to tell the user, saying only what is known.
 *
 * The client cannot see whether the settle landed — the server stamps rows, then
 * re-reads them, so a rejection can arrive with the write already applied. A clean
 * rollback is the one case where "nothing was recorded" is a fact rather than a guess.
 */
export function reimbursementFailureCopy(error: unknown): string {
  const why = error instanceof Error ? error.message : 'Could not record the reimbursement'
  if (error instanceof ReimbursementSettleError && !error.rolledBack) {
    return `${why}. The payment may still exist — check Past reports before recording it again.`
  }
  if (error instanceof ReimbursementSettleError && error.status === 409) {
    return `${why}. Nothing was recorded, but retrying as-is will fail — refresh and check what is already settled.`
  }
  return `${why}. Nothing was recorded — try again.`
}

export async function recordReimbursement(
  actions: ExpenseActions,
  input: NewTransaction,
  transactionIds: number[],
): Promise<void> {
  const created = await actions.createTransaction(input)
  if (transactionIds.length === 0) return
  try {
    await actions.updateTransactions(transactionIds, { settledBy: created.id })
  } catch (error) {
    let rolledBack = true
    try {
      await actions.deleteTransaction(created.id)
    } catch (cleanupError) {
      rolledBack = false
      console.error('Failed to roll back an unlinked reimbursement', cleanupError)
    }
    throw new ReimbursementSettleError(error, rolledBack)
  }
}
