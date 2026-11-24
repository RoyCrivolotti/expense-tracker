import { useState } from 'react'
import type { ContributionStep } from '../../../types'
import { shortMonthYearLabel } from '../../../engine'
import { MonthInput } from '../../components/MonthInput'
import { MoneyField } from './goalControlFields'
import { useRegisterOpenForm } from './openForms'
import { firstMonthAfter } from './stepMonths'
import styles from './goals.module.css'

/** What is wrong with a change starting in `from`, or null: too early, or a month another change already has. */
function stepProblem(
  steps: ContributionStep[],
  from: string,
  earliest: string,
  ignoreIndex: number | undefined,
): string | null {
  if (from < earliest) {
    return 'A change has to start after the plan starts. To change the starting amount, edit Monthly investing.'
  }
  if (steps.some((s, i) => i !== ignoreIndex && s.from === from)) {
    return `There is already a change from ${shortMonthYearLabel(from)}.`
  }
  return null
}

export function StepForm({
  steps,
  planStartDate,
  initial,
  ignoreIndex,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  steps: ContributionStep[]
  planStartDate: string
  initial: ContributionStep
  /** The change being edited, which does not count as a repeat of its own month. */
  ignoreIndex?: number
  submitLabel: 'Add' | 'Save'
  onSubmit: (step: ContributionStep) => void
  onCancel: () => void
}) {
  useRegisterOpenForm()
  const earliest = firstMonthAfter(planStartDate)
  const [from, setFrom] = useState(initial.from)
  const [monthlyCents, setMonthlyCents] = useState(initial.monthlyCents)
  const [tried, setTried] = useState(false)

  const problem = stepProblem(steps, from, earliest, ignoreIndex)

  function submit() {
    setTried(true)
    if (problem) return
    onSubmit({ from, monthlyCents })
  }

  return (
    <div className={styles.lifeEventForm}>
      <div className={styles.field}>
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>From</span>
          <MonthInput value={from} ariaLabel="Change starts in" onChange={setFrom} />
        </div>
        <p className={styles.fieldHint}>It takes effect on the 1st of the month you pick.</p>
      </div>
      <MoneyField label="Monthly amount from then" value={monthlyCents} onChange={setMonthlyCents} />
      {tried && problem ? (
        <p className={styles.fieldHint} role="alert">
          {problem}
        </p>
      ) : null}
      <div className={styles.lifeEventActions}>
        <button type="button" className={styles.addLifeEventBtn} onClick={submit}>
          {submitLabel}
        </button>
        <button type="button" className={styles.lifeEventCancelBtn} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
