import { useState } from 'react'
import type { InstallmentPlan } from '../../types'
import type { ExpenseModel } from '../useExpenseData'
import type { ExpenseActions } from '../actions'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import { selectableOptions } from '../components/pickerOptions'
import formStyles from '../components/TransactionForm.module.css'
import stepStyles from '../components/InstallmentStep.module.css'
import { planErrorCopy } from './planErrorCopy'
import { PlanAccountFields, PlanAmountFields, PlanKindFields, PlanScheduleFields } from './planFields'
import { initialFields, toPayload, type Fields } from './planFieldsModel'

interface Props {
  plan: InstallmentPlan
  model: ExpenseModel
  actions: ExpenseActions
  onBack: () => void
  /** Lets the enclosing Modal pause its focus trap while the month popover is open. */
  onTrapPausedChange?: ((paused: boolean) => void) | undefined
}

export function InstallmentPlanForm({ plan, model, actions, onBack, onTrapPausedChange }: Props) {
  const format = useMoneyFormat()
  const [f, setF] = useState<Fields>(() => initialFields(plan, format))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const set = <K extends keyof Fields>(
    key: K,
    value: Fields[K],
  ) => setF((prev) => ({ ...prev, [key]: value }))
  const accounts = selectableOptions(model.dataset.accounts, f.accountId)
  const categories = selectableOptions(model.dataset.categories, f.categoryId)

  const submit = async () => {
    setBusy(true)
    setErr(null)
    try {
      await actions.updateInstallmentPlan(plan.id, toPayload(f, format))
      onBack()
    } catch (e) {
      setErr(planErrorCopy(e))
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
      <PlanAmountFields f={f} set={set} symbol={format.symbol} />
      <PlanScheduleFields f={f} set={set} onTrapPausedChange={onTrapPausedChange} />
      <PlanAccountFields f={f} set={set} accounts={accounts} categories={categories} />
      <PlanKindFields f={f} set={set} />
      {err && <p className={formStyles.error}>{err}</p>}
      <div className={formStyles.actions}>
        <button type="submit" className={`${formStyles.save} tapActive`} disabled={busy}>
          {busy ? 'Saving…' : 'Save plan'}
        </button>
      </div>
    </form>
  )
}
