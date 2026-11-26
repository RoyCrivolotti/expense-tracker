import { useState } from 'react'
import type { Transaction } from '../../types'
import type { ExpenseModel } from '../useExpenseData'
import type { InstallmentDraft, InstallmentMode } from './installmentIntent'
import { planProgress } from '../../engine'
import { ExistingFields, NewFields, type SetDraft } from './InstallmentFields'
import { modeOptions } from './installmentModes'
import formStyles from './TransactionForm.module.css'
import styles from './InstallmentStep.module.css'

interface Props {
  model: ExpenseModel
  editing: Transaction | null
  draft: InstallmentDraft
  set: SetDraft
  error?: string | null | undefined
  /** The amount currently entered on the Details step (always positive). */
  amountCents: number
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
  const [selected, setSelected] = useState<InstallmentMode>(linked || draft.mode !== 'none' ? draft.mode : 'new')

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
      {selected === 'unlink' ? <p className={styles.summary}>This payment will be removed from its plan.</p> : null}
      {error ? <p className={formStyles.error}>{error}</p> : null}
    </div>
  )
}
