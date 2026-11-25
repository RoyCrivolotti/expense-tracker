import type { Dispatch, SetStateAction } from 'react'
import type { MoneyFormat } from '../../engine/money'
import type { ToastApi } from '../hooks/useToast'
import type { ExpenseActions } from '../actions'
import type { ExpenseModel } from '../useExpenseData'
import { buildBatchTransactions, type DateBatchDraft } from './batchTransactionIntent'
import { suggestBudgetMonth } from './transactionFormState'

export const rowElementId = (rowId: string) => `batch-row-${rowId}`

interface SaveBatchArgs {
  batches: DateBatchDraft[]
  format: MoneyFormat
  model: ExpenseModel
  flagId: number | null
  investmentCategoryId: number | null
  actions: ExpenseActions
  setErrors: Dispatch<SetStateAction<Record<string, string>>>
  setBusy: (busy: boolean) => void
  showToast: ToastApi['showToast']
  onClose: () => void
}

export async function saveBatch({
  batches,
  format,
  model,
  flagId,
  investmentCategoryId,
  actions,
  setErrors,
  setBusy,
  showToast,
  onClose,
}: SaveBatchArgs) {
  const result = buildBatchTransactions(
    batches,
    format,
    (date) => suggestBudgetMonth(model, date),
    flagId,
    investmentCategoryId,
  )
  if (!result.ok) {
    setErrors(result.errors)
    const firstErrorRowId = Object.keys(result.errors)[0]
    if (firstErrorRowId) {
      document.getElementById(rowElementId(firstErrorRowId))?.scrollIntoView({ behavior: 'auto', block: 'center' })
    } else {
      showToast('Add at least one transaction', 'error')
    }
    return
  }
  setErrors({})
  setBusy(true)
  try {
    await actions.createTransactions(result.transactions)
    showToast(
      `Added ${result.transactions.length} transaction${result.transactions.length === 1 ? '' : 's'}`,
      'success',
    )
    onClose()
  } catch (e) {
    showToast(e instanceof Error ? e.message : 'Could not save', 'error')
  } finally {
    setBusy(false)
  }
}
