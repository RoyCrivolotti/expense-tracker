import type { Transaction } from '../../types'
import type { NewTransaction } from '../../data/dataSource'
import type { ExpenseActions, TransactionSeed } from '../actions'
import type { ExpenseModel } from '../useExpenseData'
import { useToast } from '../hooks/useToast'
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
  const { showToast } = useToast()

  const submit = async (input: NewTransaction, id?: number) => {
    if (id != null) {
      await actions.updateTransaction(id, input)
      showToast('Transaction updated', 'success')
    } else {
      await actions.createTransaction(input)
      showToast('Transaction added', 'success')
    }
  }

  const remove = async (id: number) => {
    await actions.deleteTransaction(id)
    showToast('Transaction deleted', 'success')
  }

  return (
    <Modal title={editing ? 'Edit transaction' : 'New transaction'} onClose={onClose}>
      <TransactionForm
        model={model}
        editing={editing}
        seed={seed}
        onSubmit={submit}
        onDelete={remove}
        onClose={onClose}
      />
    </Modal>
  )
}
