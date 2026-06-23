import type { Transaction } from '../../types'
import type { NewTransaction } from '../../data/dataSource'
import type { ExpenseDataSource } from '../../data/dataSource'
import type { ExpenseModel } from '../useExpenseData'
import type { ExpenseDataset } from '../../types'
import type { TransactionSeed } from '../actions'
import {
  patchAfterTransactionCreate,
  patchAfterTransactionDelete,
  patchAfterTransactionUpdate,
} from '../datasetPatches'
import { Modal } from './Modal'
import { TransactionForm } from './TransactionForm'

interface Props {
  model: ExpenseModel
  source: ExpenseDataSource
  editing: Transaction | null
  seed?: TransactionSeed | undefined
  onClose: () => void
  applyPatch: (patch: (dataset: ExpenseDataset) => ExpenseDataset) => void
}

export function TransactionModal({ model, source, editing, seed, onClose, applyPatch }: Props) {
  const submit = async (input: NewTransaction, id?: number) => {
    if (id != null) {
      const txn = await source.updateTransaction!(id, input)
      applyPatch((d) => patchAfterTransactionUpdate(d, txn))
    } else {
      const txn = await source.createTransaction!(input)
      applyPatch((d) => patchAfterTransactionCreate(d, txn))
    }
  }
  const onDelete = source.deleteTransaction
    ? async (id: number) => {
        await source.deleteTransaction!(id)
        applyPatch((d) => patchAfterTransactionDelete(d, id))
      }
    : undefined

  return (
    <Modal title={editing ? 'Edit transaction' : 'New transaction'} onClose={onClose}>
      <TransactionForm
        model={model}
        editing={editing}
        seed={seed}
        onSubmit={submit}
        onDelete={onDelete}
        onClose={onClose}
      />
    </Modal>
  )
}
