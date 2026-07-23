import type { Transaction } from '../../types'
import type { NewInstallmentPlan, NewTransaction } from '../../data/dataSource'
import type { ExpenseActions, TransactionSeed } from '../actions'
import type { ExpenseModel } from '../useExpenseData'
import { finalBudgetMonth } from '../../engine'
import { fullMonthLabel } from '../../engine/dates'
import { useToast } from '../hooks/useToast'
import { Modal } from './Modal'
import { TransactionForm } from './TransactionForm'
import type { InstallmentIntent } from './installmentIntent'

/** "Installment 21 of 24 · Final payment November 2026" for a plan-linked edit. */
function installmentNote(editing: Transaction | null, model: ExpenseModel): string | undefined {
  if (!editing || editing.planId == null || editing.installmentIndex == null) return undefined
  const plan = model.lookup.installmentPlan(editing.planId)
  if (!plan) return undefined
  return `Installment ${editing.installmentIndex} of ${plan.totalCount} · Final payment ${fullMonthLabel(finalBudgetMonth(plan))}`
}

/** Build a new plan anchored to the transaction being saved. */
function planFromInput(input: NewTransaction, totalCount: number, startIndex: number): NewInstallmentPlan {
  return {
    description: input.description,
    amountCents: Math.abs(input.amountCents),
    totalCount,
    accountId: input.accountId,
    categoryId: input.categoryId,
    type: input.type,
    anchorBudgetMonth: input.budgetMonth,
    startInstallmentIndex: startIndex,
    active: true,
  }
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

  const create = async (input: NewTransaction, intent?: InstallmentIntent) => {
    if (intent?.kind === 'new') {
      const plan = await actions.createInstallmentPlan(
        planFromInput(input, intent.totalCount, intent.installmentIndex),
      )
      await actions.createTransaction({
        ...input,
        planId: plan.id,
        installmentIndex: intent.installmentIndex,
      })
      return
    }
    if (intent?.kind === 'link') {
      await actions.createTransaction({
        ...input,
        planId: intent.planId,
        installmentIndex: intent.installmentIndex,
      })
      return
    }
    await actions.createTransaction(input)
  }

  const edit = async (id: number, input: NewTransaction, intent?: InstallmentIntent) => {
    if (intent?.kind === 'new') {
      const plan = await actions.createInstallmentPlan(
        planFromInput(input, intent.totalCount, intent.installmentIndex),
      )
      await actions.updateTransaction(id, {
        ...input,
        planId: plan.id,
        installmentIndex: intent.installmentIndex,
      })
      return
    }
    if (intent?.kind === 'link') {
      await actions.updateTransaction(id, {
        ...input,
        planId: intent.planId,
        installmentIndex: intent.installmentIndex,
      })
      return
    }
    if (intent?.kind === 'unlink') {
      await actions.updateTransaction(id, { ...input, planId: null })
      return
    }
    await actions.updateTransaction(id, input)
  }

  const submit = async (input: NewTransaction, id?: number, intent?: InstallmentIntent) => {
    if (id != null) {
      await edit(id, input, intent)
      showToast('Transaction updated', 'success')
    } else {
      await create(input, intent)
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
