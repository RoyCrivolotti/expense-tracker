import { useState } from 'react'
import type { InstallmentPlan, TxnType } from '../../types'
import type { NewInstallmentPlan } from '../../data/dataSource'
import type { ExpenseModel } from '../useExpenseData'
import type { ExpenseActions } from '../actions'
import { formatEuroInput, parseEuroToCents } from '../../engine/money'
import { Modal } from '../components/Modal'
import formStyles from '../components/TransactionForm.module.css'
import styles from './definitions.module.css'

interface Props {
  plan: InstallmentPlan | null
  model: ExpenseModel
  actions: ExpenseActions
  onClose: () => void
}

interface Fields {
  description: string
  amount: string
  totalCount: string
  startInstallmentIndex: string
  anchorBudgetMonth: string
  accountId: number
  categoryId: number
  type: TxnType
  active: boolean
}

const TXN_TYPES: TxnType[] = ['expense', 'income', 'investment', 'refund']

function initialFields(plan: InstallmentPlan | null, model: ExpenseModel): Fields {
  const { accounts, categories } = model.dataset
  if (plan) {
    return {
      description: plan.description,
      amount: formatEuroInput(plan.amountCents),
      totalCount: String(plan.totalCount),
      startInstallmentIndex: String(plan.startInstallmentIndex),
      anchorBudgetMonth: plan.anchorBudgetMonth,
      accountId: plan.accountId,
      categoryId: plan.categoryId,
      type: plan.type,
      active: plan.active,
    }
  }
  return {
    description: '',
    amount: '',
    totalCount: '',
    startInstallmentIndex: '1',
    anchorBudgetMonth: model.months[model.months.length - 1] ?? '',
    accountId: accounts[0]?.id ?? 0,
    categoryId: categories[0]?.id ?? 0,
    type: 'expense',
    active: true,
  }
}

function toPayload(f: Fields): NewInstallmentPlan {
  return {
    description: f.description.trim(),
    amountCents: Math.abs(parseEuroToCents(f.amount)),
    totalCount: Number(f.totalCount),
    startInstallmentIndex: Number(f.startInstallmentIndex),
    anchorBudgetMonth: f.anchorBudgetMonth,
    accountId: f.accountId,
    categoryId: f.categoryId,
    type: f.type,
    active: f.active,
  }
}

export function InstallmentPlanModal({ plan, model, actions, onClose }: Props) {
  const [f, setF] = useState<Fields>(() => initialFields(plan, model))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const set = <K extends keyof Fields>(key: K, value: Fields[K]) =>
    setF((prev) => ({ ...prev, [key]: value }))

  const submit = async () => {
    setBusy(true)
    setErr(null)
    try {
      const payload = toPayload(f)
      if (plan) await actions.updateInstallmentPlan(plan.id, payload)
      else await actions.createInstallmentPlan(payload)
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save')
      setBusy(false)
    }
  }

  return (
    <Modal title={plan ? `Edit ${plan.description}` : 'New installment plan'} onClose={onClose}>
      <form
        className={formStyles.form}
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <label className={formStyles.field}>
          <span className={formStyles.label}>Description</span>
          <input value={f.description} onChange={(e) => set('description', e.target.value)} />
        </label>
        <label className={formStyles.field}>
          <span className={formStyles.label}>Installment amount (€)</span>
          <input
            type="number"
            step="0.01"
            value={f.amount}
            onChange={(e) => set('amount', e.target.value)}
          />
        </label>
        <label className={formStyles.field}>
          <span className={formStyles.label}>Total installments</span>
          <input
            type="number"
            step="1"
            value={f.totalCount}
            onChange={(e) => set('totalCount', e.target.value)}
          />
        </label>
        <label className={formStyles.field}>
          <span className={formStyles.label}>First tracked installment</span>
          <input
            type="number"
            step="1"
            value={f.startInstallmentIndex}
            onChange={(e) => set('startInstallmentIndex', e.target.value)}
          />
        </label>
        <label className={formStyles.field}>
          <span className={formStyles.label}>Anchor budget month</span>
          <input
            type="month"
            value={f.anchorBudgetMonth}
            onChange={(e) => set('anchorBudgetMonth', e.target.value)}
          />
        </label>
        <label className={formStyles.field}>
          <span className={formStyles.label}>Account</span>
          <select
            value={String(f.accountId)}
            onChange={(e) => set('accountId', Number(e.target.value))}
          >
            {model.dataset.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className={formStyles.field}>
          <span className={formStyles.label}>Category</span>
          <select
            value={String(f.categoryId)}
            onChange={(e) => set('categoryId', Number(e.target.value))}
          >
            {model.dataset.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className={formStyles.field}>
          <span className={formStyles.label}>Type</span>
          <select value={f.type} onChange={(e) => set('type', e.target.value as TxnType)}>
            {TXN_TYPES.map((t) => (
              <option key={t} value={t}>
                {t[0]!.toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={f.active}
            onChange={(e) => set('active', e.target.checked)}
          />
          <span>Active</span>
        </label>
        {err && <p className={formStyles.error}>{err}</p>}
        <div className={formStyles.actions}>
          <button type="submit" className={`${formStyles.save} tapActive`} disabled={busy}>
            {busy ? 'Saving…' : plan ? 'Save plan' : 'Add plan'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
