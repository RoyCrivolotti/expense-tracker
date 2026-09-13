import type { NewTransaction } from '../../data/dataSource'
import type { ExpenseActions } from '../actions'

/**
 * Record a reimbursement and mark what it covered.
 *
 * Two calls rather than one endpoint, because both already exist and are
 * owner-scoped: create the `refund`, then stamp the rows it settles. If the
 * stamp fails the refund is deleted again, so a half-finished settlement never
 * survives — the same compensating-delete shape `createPlanAndLink` uses for a
 * plan whose transaction fails to link.
 *
 * The refund itself carries **no flag**. The rows it settles leave the Flagged
 * card on their own, and a flagged refund would then subtract a second time —
 * the claim would read as over-paid by its own settlement.
 */
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
    try {
      await actions.deleteTransaction(created.id)
    } catch (cleanupError) {
      console.error('Failed to roll back an unlinked reimbursement', cleanupError)
    }
    throw error
  }
}
