import type { Transaction } from '../../types'
import type { NewTransaction } from '../../data/dataSource'
import type { ExpenseActions, TransactionSeed } from '../actions'
import type { ExpenseModel } from '../useExpenseData'
import { finalBudgetMonth } from '../../engine'
import { fullMonthLabel } from '../../engine/dates'
import { useToast } from '../hooks/useToast'
import { Modal } from './Modal'
import { TransactionForm } from './TransactionForm'

/** "Installment 21 of 24 · Final payment November 2026" for a plan-linked edit. */
function installmentNote(editing: Transaction | null, model: ExpenseModel): string | undefined {
  if (!editing || editing.planId == null || editing.installmentIndex == null) return undefined
  const plan = model.lookup.installmentPlan(editing.planId)
  if (!plan) return undefined
  return `Installment ${editing.installmentIndex} of ${plan.totalCount} · Final payment ${fullMonthLabel(finalBudgetMonth(plan))}`
}

interface Props {
  model: ExpenseModel
  actions: ExpenseActions
  editing: Transaction | null
  seed?: TransactionSeed | undefined
  hint?: string | undefined
  onClose: () => void
}

export function TransactionModal({ model, actions, editing, seed, hint, onClose }: Props) {
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

  const subtitle = hint ?? installmentNote(editing, model)

  return (
    <Modal
      title={editing ? 'Edit transaction' : 'New transaction'}
      {...(subtitle ? { subtitle } : {})}
      onClose={onClose}
    >
      <TransactionForm
        model={model}
        editing={editing}
        seed={seed}
        onSubmit={submit}
        onDelete={remove}
        onDuplicate={actions.onDuplicate}
        onClose={onClose}
      />
    </Modal>
  )
}
