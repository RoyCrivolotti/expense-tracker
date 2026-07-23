import type { Transaction } from '../../types'
import type { ExpenseModel } from '../useExpenseData'
import type { InstallmentDraft, InstallmentMode } from './installmentIntent'
import { finalBudgetMonth, planProgress } from '../../engine'
import { fullMonthLabel } from '../../engine/dates'
import formStyles from './TransactionForm.module.css'
import styles from './InstallmentStep.module.css'

type SetDraft = <K extends keyof InstallmentDraft>(key: K, value: InstallmentDraft[K]) => void

interface Props {
  model: ExpenseModel
  editing: Transaction | null
  draft: InstallmentDraft
  set: SetDraft
  onBack: () => void
  error?: string | null | undefined
}

interface ModeOption {
  mode: InstallmentMode
  label: string
}

function modeOptions(linked: boolean, hasPlans: boolean): ModeOption[] {
  const base: ModeOption[] = linked
    ? [
        { mode: 'none', label: 'Keep' },
        { mode: 'existing', label: 'Change plan' },
        { mode: 'new', label: 'New plan' },
        { mode: 'unlink', label: 'Remove' },
      ]
    : [
        { mode: 'none', label: 'None' },
        { mode: 'new', label: 'New plan' },
        { mode: 'existing', label: 'Existing plan' },
      ]
  return base.filter((o) => o.mode !== 'existing' || hasPlans)
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className={formStyles.field}>
      <span className={formStyles.label}>{label}</span>
      <input
        type="number"
        inputMode="numeric"
        step="1"
        min="1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}

function NewFields({ draft, set }: { draft: InstallmentDraft; set: SetDraft }) {
  return (
    <>
      <div className={formStyles.row}>
        <NumberField
          label="Total installments"
          value={draft.totalCount}
          onChange={(v) => set('totalCount', v)}
        />
        <NumberField
          label="This installment #"
          value={draft.installmentIndex}
          onChange={(v) => set('installmentIndex', v)}
        />
      </div>
      <p className={styles.summary}>The plan is anchored to this transaction&apos;s budget month.</p>
    </>
  )
}

function ExistingFields({
  model,
  draft,
  set,
  onSelectPlan,
}: {
  model: ExpenseModel
  draft: InstallmentDraft
  set: SetDraft
  onSelectPlan: (planId: number) => void
}) {
  const plan = draft.planId != null ? model.lookup.installmentPlan(draft.planId) : undefined
  return (
    <>
      <label className={formStyles.field}>
        <span className={formStyles.label}>Plan</span>
        <select
          value={draft.planId ?? ''}
          onChange={(e) => onSelectPlan(Number(e.target.value))}
        >
          {model.dataset.installmentPlans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.description}
            </option>
          ))}
        </select>
      </label>
      <NumberField
        label="This installment #"
        value={draft.installmentIndex}
        onChange={(v) => set('installmentIndex', v)}
      />
      {plan ? (
        <p className={styles.summary}>Final payment {fullMonthLabel(finalBudgetMonth(plan))}</p>
      ) : null}
    </>
  )
}

export function InstallmentStep({ model, editing, draft, set, onBack, error }: Props) {
  const plans = model.dataset.installmentPlans
  const linked = editing?.planId != null

  const selectPlan = (planId: number) => {
    set('planId', planId)
    const plan = model.lookup.installmentPlan(planId)
    if (!plan) return
    set('totalCount', String(plan.totalCount))
    const nextIndex =
      editing?.planId === planId && editing.installmentIndex != null
        ? editing.installmentIndex
        : planProgress(plan, model.dataset.transactions).nextIndex
    set('installmentIndex', String(nextIndex))
  }

  const chooseMode = (mode: InstallmentMode) => {
    set('mode', mode)
    if (mode === 'new' && !draft.installmentIndex) set('installmentIndex', '1')
    if (mode === 'existing' && draft.planId == null) {
      const initial = editing?.planId ?? plans[0]?.id
      if (initial != null) selectPlan(initial)
    }
  }

  return (
    <div className={styles.step}>
      <button type="button" className={styles.back} onClick={onBack}>
        &larr; Back to details
      </button>
      <div className={styles.modes}>
        {modeOptions(linked, plans.length > 0).map((o) => (
          <button
            key={o.mode}
            type="button"
            className={`${styles.modeBtn} ${draft.mode === o.mode ? styles.modeActive : ''}`}
            onClick={() => chooseMode(o.mode)}
          >
            {o.label}
          </button>
        ))}
      </div>
      {draft.mode === 'new' ? <NewFields draft={draft} set={set} /> : null}
      {draft.mode === 'existing' ? (
        <ExistingFields model={model} draft={draft} set={set} onSelectPlan={selectPlan} />
      ) : null}
      {draft.mode === 'unlink' ? (
        <p className={styles.summary}>This payment will be removed from its plan.</p>
      ) : null}
      {error ? <p className={formStyles.error}>{error}</p> : null}
    </div>
  )
}
