import type { Transaction } from '../../types'
import type { NewTransaction } from '../../data/dataSource'
import type { ExpenseActions, TransactionSeed } from '../actions'
import type { ExpenseModel } from '../useExpenseData'
import { Modal } from './Modal'
import { TransactionForm } from './TransactionForm'

interface Props {
  model: ExpenseModel
  actions: ExpenseActions
  editing: Transaction | null
  seed?: TransactionSeed | undefined
  onClose: () => void
}

export function TransactionModal({ model, actions, editing, seed, onClose }: Props) {
  const submit = async (input: NewTransaction, id?: number) => {
    if (id != null) await actions.updateTransaction(id, input)
    else await actions.createTransaction(input)
  }

  return (
    <Modal title={editing ? 'Edit transaction' : 'New transaction'} onClose={onClose}>
      <TransactionForm
        model={model}
        editing={editing}
        seed={seed}
        onSubmit={submit}
        onDelete={actions.deleteTransaction}
        onClose={onClose}
      />
    </Modal>
  )
}
