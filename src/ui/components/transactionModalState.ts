import { useState } from 'react'
import type { Transaction } from '../../types'
import type { ExpenseModel } from '../useExpenseData'
import type { ExpenseActions, TransactionSeed } from '../actions'
import type { ToastApi } from '../hooks/useToast'
import { finalBudgetMonth } from '../../engine'
import { shortMonthFullYearLabel } from '../../engine/dates'

/** "Installment 21/24 · Last payment Nov 2026" for a plan-linked edit. */
export function installmentNote(
  editing: Transaction | null,
  model: ExpenseModel,
): string | undefined {
  if (!editing || editing.planId == null || editing.installmentIndex == null) return undefined
  const plan = model.lookup.installmentPlan(editing.planId)
  if (!plan) return undefined
  return `Installment ${editing.installmentIndex}/${plan.totalCount} · Last payment ${shortMonthFullYearLabel(finalBudgetMonth(plan))}`
}

export function titleFor(
  editing: Transaction | null,
  mode: 'single' | 'batch',
  formView: 'fields' | 'installment',
): string {
  if (mode === 'batch') return 'Add multiple transactions'
  if (formView === 'installment') return 'Installment plan'
  return editing ? 'Edit transaction' : 'New transaction'
}

/** Guards a modal's close against silently discarding unsaved input: closing
 * while `isDirty` shows a confirm sheet instead of closing immediately. */
export function useCloseGuard(
  isDirty: boolean,
  onClose: () => void,
) {
  const [confirming, setConfirming] = useState(false)
  const requestClose = () => {
    if (isDirty) {
      setConfirming(true)
      return
    }
    onClose()
  }
  const cancel = () => setConfirming(false)
  return { confirming, requestClose, cancel, modalOnClose: confirming ? cancel : requestClose }
}

/** The unsaved-work state of both tabs, and the confirm that guards closing over it. */
export function useDraftGuards(onClose: () => void) {
  // Both forms stay mounted (see the `hidden` props in TransactionModal) so switching the
  // "Add one" / "Add multiple" tab back and forth never loses what's already
  // typed on either side — each keeps its own state alive while hidden.
  const [singleDirty, setSingleDirty] = useState(false)
  const [batchDirty, setBatchDirty] = useState(false)
  // The batch tab saved while the single tab still holds an unsaved draft.
  const [discardingOther, setDiscardingOther] = useState(false)
  // Receipts stranded on a row that did save. Not "unsaved changes".
  const [stranded, setStranded] = useState(0)
  // Either side counts, not just the currently visible one: closing from an
  // empty batch tab would otherwise silently drop a still-hidden, filled-in
  // single-transaction draft (and vice versa).
  const anyDirty = singleDirty || batchDirty
  const { confirming, cancel, modalOnClose } = useCloseGuard(anyDirty, onClose)

  /**
   * The batch tab finished. The single form stays mounted behind it and keeps
   * its own draft — staged receipts included — so this cannot just close.
   */
  const closeFromBatch = () => {
    if (singleDirty) setDiscardingOther(true)
    else onClose()
  }
  return {
    setSingleDirty,
    setBatchDirty,
    discardingOther,
    setDiscardingOther,
    stranded,
    setStranded,
    confirming,
    cancel,
    modalOnClose,
    closeFromBatch,
  }
}

/** Which tab is showing, which step the single form is on, and whether the batch tab exists at all. */
export function useModalModes(
  editing: Transaction | null,
  seed: TransactionSeed | undefined,
) {
  const [mode, setMode] = useState<'single' | 'batch'>('single')
  const [formView, setFormView] = useState<'fields' | 'installment'>('fields')
  // Batch mode only makes sense for a from-scratch add: a seed (duplicate,
  // "add expense in this category" shortcut, etc.) is a request to prefill one
  // specific transaction, which BatchTransactionForm has no way to honor.
  const canBatch = editing == null && seed == null
  return { mode, setMode, formView, setFormView, canBatch }
}

/** Deletes a transaction and says so; a failure goes to whoever called. */
export function deleteWithToast(
  actions: ExpenseActions,
  showToast: ToastApi['showToast'],
) {
  return async (id: number) => {
    await actions.deleteTransaction(id)
    showToast('Transaction deleted', 'success')
  }
}
