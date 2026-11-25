import { useEffect } from 'react'
import type { ExpenseModel } from '../useExpenseData'

/**
 * The receipts of the transaction being edited, and how many it has. A model that reads receipt lists on
 * request has only the count until the list is asked for here.
 */
export function useReceipts(
  model: ExpenseModel,
  transactionId: number | null,
) {
  const { ensureReceipts, lookup } = model
  useEffect(() => {
    if (transactionId != null) ensureReceipts?.([transactionId])
  }, [transactionId, ensureReceipts])
  return {
    attachments: transactionId != null ? lookup.attachments(transactionId) : [],
    count: transactionId != null ? lookup.attachmentCount(transactionId) : 0,
  }
}
