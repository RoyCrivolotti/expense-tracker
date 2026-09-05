import { useState } from 'react'
import type { Transaction } from '../../types'
import type { NewTransaction } from '../../data/dataSource'
import type { ExpenseActions, TransactionSeed } from '../actions'
import type { ExpenseModel } from '../useExpenseData'
import { finalBudgetMonth } from '../../engine'
import { fullMonthLabel } from '../../engine/dates'
import { useToast } from '../hooks/useToast'
import { BatchTransactionForm } from './BatchTransactionForm'
import { Modal } from './Modal'
import { TransactionForm } from './TransactionForm'
import type { InstallmentIntent } from './installmentIntent'
import { createTransactionWithIntent, updateTransactionWithIntent } from './transactionSaveIntent'
import styles from './TransactionModal.module.css'

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
  const [mode, setMode] = useState<'single' | 'batch'>('single')
  const canBatch = editing == null

  const submit = async (input: NewTransaction, id?: number, intent?: InstallmentIntent) => {
    if (id != null) {
      await updateTransactionWithIntent(actions, id, input, intent)
      showToast('Transaction updated', 'success')
    } else {
      await createTransactionWithIntent(actions, input, intent)
      showToast('Transaction added', 'success')
    }
  }

  const remove = async (id: number) => {
    await actions.deleteTransaction(id)
    showToast('Transaction deleted', 'success')
  }

  const subtitle = hint ?? installmentNote(editing, model)
  const title = editing ? 'Edit transaction' : mode === 'batch' ? 'Add multiple transactions' : 'New transaction'

  return (
    <Modal title={title} {...(subtitle ? { subtitle } : {})} onClose={onClose}>
      {canBatch && (
        <div className={styles.modeToggle} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'single'}
            className={`${styles.modeBtn} ${mode === 'single' ? styles.modeActive : ''}`}
            onClick={() => setMode('single')}
          >
            Add one
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'batch'}
            className={`${styles.modeBtn} ${mode === 'batch' ? styles.modeActive : ''}`}
            onClick={() => setMode('batch')}
          >
            Add multiple
          </button>
        </div>
      )}
      {canBatch && mode === 'batch' ? (
        <BatchTransactionForm model={model} actions={actions} onClose={onClose} />
      ) : (
        <TransactionForm
          model={model}
          editing={editing}
          seed={seed}
          onSubmit={submit}
          onDelete={remove}
          onDuplicate={actions.onDuplicate}
          onClose={onClose}
        />
      )}
    </Modal>
  )
}
