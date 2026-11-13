import type { ExpenseActions, ExpenseModalState } from './actions'
import { TransactionModal } from './components/TransactionModal'
import type { ExpenseModel } from './useExpenseData'

export function ActiveTransactionModal({
  modal,
  actions,
  model,
  onClose,
}: {
  modal: Exclude<ExpenseModalState, null>
  actions: ExpenseActions
  model: ExpenseModel
  onClose: () => void
}) {
  return (
    <TransactionModal
      model={model}
      actions={actions}
      editing={modal.mode === 'edit' ? modal.txn : null}
      seed={modal.mode === 'add' ? modal.seed : undefined}
      hint={modal.mode === 'add' ? modal.hint : undefined}
      onClose={onClose}
    />
  )
}
