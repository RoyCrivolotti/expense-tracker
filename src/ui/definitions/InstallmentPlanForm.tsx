import { useState } from 'react'
import type { InstallmentPlan, TxnType } from '../../types'
import type { NewInstallmentPlan } from '../../data/dataSource'
import type { ExpenseModel } from '../useExpenseData'
import type { ExpenseActions } from '../actions'
import { formatMoneyInput, parseMoneyToCents, type MoneyFormat } from '../../engine/money'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import formStyles from '../components/TransactionForm.module.css'
import stepStyles from '../components/InstallmentStep.module.css'
import styles from './definitions.module.css'

const TXN_TYPES: TxnType[] = ['expense', 'income', 'investment', 'refund']

interface Fields {
  description: string
  amount: string
  totalCount: string
  startInstallmentIndex: string
  anchorBudgetMonth: string
  dueDay: string
  accountId: number
  categoryId: number
  type: TxnType
  active: boolean
}

function initialFields(plan: InstallmentPlan, format: MoneyFormat): Fields {
  return {
    description: plan.description,
    amount: formatMoneyInput(plan.amountCents, format),
    totalCount: String(plan.totalCount),
    startInstallmentIndex: String(plan.startInstallmentIndex),
    anchorBudgetMonth: plan.anchorBudgetMonth,
    dueDay: plan.dueDayOfMonth != null ? String(plan.dueDayOfMonth) : '',
    accountId: plan.accountId,
    categoryId: plan.categoryId,
    type: plan.type,
    active: plan.active,
  }
}

function toPayload(f: Fields, format: MoneyFormat): NewInstallmentPlan {
  return {
    description: f.description.trim(),
    amountCents: Math.abs(parseMoneyToCents(f.amount, format)),
    totalCount: Number(f.totalCount),
    startInstallmentIndex: Number(f.startInstallmentIndex),
    anchorBudgetMonth: f.anchorBudgetMonth,
    dueDayOfMonth: f.dueDay.trim() === '' ? null : Number(f.dueDay),
    accountId: f.accountId,
    categoryId: f.categoryId,
    type: f.type,
    active: f.active,
  }
}

interface Props {
  plan: InstallmentPlan
  model: ExpenseModel
  actions: ExpenseActions
  onBack: () => void
}

export function InstallmentPlanForm({ plan, model, actions, onBack }: Props) {
  const format = useMoneyFormat()
  const [f, setF] = useState<Fields>(() => initialFields(plan, format))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const set = <K extends keyof Fields>(key: K, value: Fields[K]) =>
    setF((prev) => ({ ...prev, [key]: value }))

  const submit = async () => {
    setBusy(true)
    setErr(null)
    try {
      await actions.updateInstallmentPlan(plan.id, toPayload(f, format))
      onBack()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save')
      setBusy(false)
    }
  }

  return (
    <form
      className={formStyles.form}
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <button type="button" className={stepStyles.back} onClick={onBack}>
        &larr; Back to plans
      </button>
      <label className={formStyles.field}>
        <span className={formStyles.label}>Description</span>
        <input value={f.description} onChange={(e) => set('description', e.target.value)} />
      </label>
      <div className={formStyles.row}>
        <label className={formStyles.field}>
          <span className={formStyles.label}>Installment amount ({format.symbol})</span>
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
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
      </div>
      <div className={formStyles.row}>
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
      </div>
      <label className={formStyles.field}>
        <span className={formStyles.label}>Due day of month (1-31, optional)</span>
        <input
          type="number"
          step="1"
          min="1"
          max="31"
          value={f.dueDay}
          onChange={(e) => set('dueDay', e.target.value)}
        />
      </label>
      <div className={formStyles.row}>
        <label className={formStyles.field}>
          <span className={formStyles.label}>Account</span>
          <select value={String(f.accountId)} onChange={(e) => set('accountId', Number(e.target.value))}>
            {model.dataset.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className={formStyles.field}>
          <span className={formStyles.label}>Category</span>
          <select value={String(f.categoryId)} onChange={(e) => set('categoryId', Number(e.target.value))}>
            {model.dataset.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
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
        <input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} />
        <span>Active</span>
      </label>
      {err && <p className={formStyles.error}>{err}</p>}
      <div className={formStyles.actions}>
        <button type="submit" className={`${formStyles.save} tapActive`} disabled={busy}>
          {busy ? 'Saving…' : 'Save plan'}
        </button>
      </div>
    </form>
  )
}
