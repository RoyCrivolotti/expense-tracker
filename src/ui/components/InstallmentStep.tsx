import { useState } from 'react'
import type { Transaction } from '../../types'
import type { ExpenseModel } from '../useExpenseData'
import type { InstallmentDraft, InstallmentMode } from './installmentIntent'
import { finalBudgetMonth, planProgress } from '../../engine'
import { fullMonthLabel } from '../../engine/dates'
import { formatCents } from '../../engine/money'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import formStyles from './TransactionForm.module.css'
import styles from './InstallmentStep.module.css'

type SetDraft = <K extends keyof InstallmentDraft>(key: K, value: InstallmentDraft[K]) => void

interface Props {
  model: ExpenseModel
  editing: Transaction | null
  draft: InstallmentDraft
  set: SetDraft
  error?: string | null | undefined
  /** The amount currently entered on the Details step (always positive). */
  amountCents: number
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
    : // Likely intent first. On an unlinked transaction 'none' is the state the
      // previous screen already reported ("Not part of a plan"), so it is the way
      // back out of a choice in progress rather than a destination of its own —
      // last in the row, and phrased as a choice.
      [
        { mode: 'new', label: 'New plan' },
        { mode: 'existing', label: 'Existing plan' },
        { mode: 'none', label: 'No plan' },
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

function NewFields({
  draft,
  set,
  promote,
  amountCents,
}: {
  draft: InstallmentDraft
  set: SetDraft
  /** Turns the highlighted-but-uncommitted 'new' selection into a real draft. */
  promote: () => void
  amountCents: number
}) {
  const format = useMoneyFormat()
  const totalCount = Number(draft.totalCount)
  const canSplit = Number.isInteger(totalCount) && totalCount >= 1
  return (
    <>
      <div className={formStyles.row}>
        <NumberField
          label="Total installments"
          value={draft.totalCount}
          onChange={(v) => {
            promote()
            set('totalCount', v)
          }}
        />
        <NumberField
          label="This installment #"
          value={draft.installmentIndex}
          onChange={(v) => {
            promote()
            set('installmentIndex', v)
          }}
        />
      </div>
      <label className={styles.splitToggle}>
        <input
          type="checkbox"
          checked={draft.splitTotal ?? false}
          onChange={(e) => {
            promote()
            set('splitTotal', e.target.checked)
          }}
        />
        <span>This is the total price — split evenly across installments</span>
      </label>
      {draft.splitTotal && canSplit ? (
        <p className={styles.summary}>
          ≈ {formatCents(Math.round(amountCents / totalCount), format)} × {totalCount}
        </p>
      ) : null}
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

export function InstallmentStep({ model, editing, draft, set, error, amountCents }: Props) {
  const plans = model.dataset.installmentPlans
  const linked = editing?.planId != null
  /*
   * Which chip is highlighted, deliberately separate from what the draft says.
   * An unlinked transaction opens on "New plan" — that is why anyone taps into
   * this step — but the draft stays 'none' until something is actually entered
   * (see `promote`), so a look-around costs nothing. This component unmounts on
   * Back, so the initial value re-derives from the draft on every entry.
   */
  const [selected, setSelected] = useState<InstallmentMode>(
    linked || draft.mode !== 'none' ? draft.mode : 'new',
  )

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

  /*
   * Writing 'new' into the draft on entry instead would cost two things: the
   * dirty check is a diff against the draft the form opened with, so merely
   * looking at this step would raise the discard confirm on close; and the empty
   * plan left behind fails `buildInstallmentIntent`, bouncing the user back here
   * on submit. Both disappear if the mode only lands once a field is touched.
   */
  const promote = () => {
    if (draft.mode !== 'none') return
    set('mode', 'new')
    if (!draft.installmentIndex) set('installmentIndex', '1')
  }

  const chooseMode = (mode: InstallmentMode) => {
    setSelected(mode)
    set('mode', mode)
    if (mode === 'new' && !draft.installmentIndex) set('installmentIndex', '1')
    if (mode === 'existing' && draft.planId == null) {
      const initial = editing?.planId ?? plans[0]?.id
      if (initial != null) selectPlan(initial)
    }
  }

  return (
    <div className={styles.step}>
      <div className={styles.modes}>
        {modeOptions(linked, plans.length > 0).map((o) => (
          <button
            key={o.mode}
            type="button"
            aria-pressed={selected === o.mode}
            className={`${styles.modeBtn} ${selected === o.mode ? styles.modeActive : ''}`}
            onClick={() => chooseMode(o.mode)}
          >
            {o.label}
          </button>
        ))}
      </div>
      {selected === 'new' ? (
        <NewFields
          /*
           * While the selection is still uncommitted the index shows the 1 that
           * `promote` is about to write, rather than sitting empty: the field is
           * prefilled from the user's point of view either way, and this keeps
           * the two from disagreeing for one keystroke.
           */
          draft={draft.mode === 'none' ? { ...draft, installmentIndex: '1' } : draft}
          set={set}
          promote={promote}
          amountCents={amountCents}
        />
      ) : null}
      {selected === 'existing' ? (
        <ExistingFields model={model} draft={draft} set={set} onSelectPlan={selectPlan} />
      ) : null}
      {selected === 'unlink' ? (
        <p className={styles.summary}>This payment will be removed from its plan.</p>
      ) : null}
      {error ? <p className={formStyles.error}>{error}</p> : null}
    </div>
  )
}
