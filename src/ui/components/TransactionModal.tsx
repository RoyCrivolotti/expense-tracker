import type { Transaction } from '../../types'
import type { NewTransaction } from '../../data/dataSource'
import type { ExpenseDataSource } from '../../data/dataSource'
import type { ExpenseModel } from '../useExpenseData'
import { Modal } from './Modal'
import { TransactionForm } from './TransactionForm'

interface Props {
  model: ExpenseModel
  source: ExpenseDataSource
  editing: Transaction | null
  onClose: () => void
  reload: () => void
}

export function TransactionModal({ model, source, editing, onClose, reload }: Props) {
  const submit = async (input: NewTransaction, id?: number) => {
    if (id != null) await source.updateTransaction?.(id, input)
    else await source.createTransaction?.(input)
    reload()
  }
  const onDelete = source.deleteTransaction
    ? async (id: number) => {
        await source.deleteTransaction?.(id)
        reload()
      }
    : undefined

  return (
    <Modal title={editing ? 'Edit transaction' : 'New transaction'} onClose={onClose}>
      <TransactionForm
        model={model}
        editing={editing}
        onSubmit={submit}
        onDelete={onDelete}
        onClose={onClose}
      />
    </Modal>
  )
}
