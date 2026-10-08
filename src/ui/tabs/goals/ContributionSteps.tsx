import { useState } from 'react'
import type { ContributionStep } from '../../../types'
import {
  CONTRIBUTION_STEP_MAX_COUNT,
  formatCents,
  normalizeContributionSchedule,
  shortMonthYearLabel,
  type MoneyFormat,
} from '../../../engine'
import { MonthInput } from '../../components/MonthInput'
import { MoneyField } from './goalControlFields'
import styles from './goals.module.css'

interface StepsProps {
  steps: ContributionStep[]
  /** The plan start, which gives a change a date to count from; null when the scenario has none. */
  planStartDate: string | null
  /** The monthly amount the scenario starts with, which a new change starts from in the form. */
  baseCents: number
  format: MoneyFormat
  onChange: (steps: ContributionStep[]) => void
}

/** The month after the one the plan starts in, which is the earliest a change can begin. */
function firstMonthAfter(planStartDate: string): string {
  const [year = 0, month = 1] = planStartDate.split('-').map(Number)
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }
  return `${next.year}-${String(next.month).padStart(2, '0')}`
}

/**
 * Changes to what a scenario invests each month, from a month on: "from March 2028, 2,500 a
 * month". Added and removed, not edited, like life events. Needs the plan start, which is what
 * a month is counted from.
 */
export function ContributionStepsList({ steps, planStartDate, baseCents, format, onChange }: StepsProps) {
  const [adding, setAdding] = useState(false)
  const full = steps.length >= CONTRIBUTION_STEP_MAX_COUNT

  function removeStep(index: number) {
    onChange(steps.filter((_, i) => i !== index))
  }

  function addStep(step: ContributionStep) {
    onChange(normalizeContributionSchedule([...steps, step]))
    setAdding(false)
  }

  return (
    <div>
      {steps.length > 0 && (
        <ul className={styles.lifeEventList}>
          {steps.map((step, index) => (
            <li key={step.from} className={styles.lifeEventRow}>
              <span className={styles.lifeEventLabel}>from {shortMonthYearLabel(step.from)}</span>
              <span className={styles.lifeEventInflow}>{formatCents(step.monthlyCents, format)}/mo</span>
              <button
                type="button"
                className={styles.lifeEventRemove}
                aria-label={`Remove the change from ${shortMonthYearLabel(step.from)}`}
                onClick={() => removeStep(index)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {planStartDate === null ? (
        <p className={styles.fieldHint}>
          A change is counted from the plan start. Set a plan start date under Plan start to add one.
        </p>
      ) : adding ? (
        <StepForm
          steps={steps}
          planStartDate={planStartDate}
          startAmountCents={steps[steps.length - 1]?.monthlyCents ?? baseCents}
          onAdd={addStep}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button type="button" className={styles.addLifeEventBtn} disabled={full} onClick={() => setAdding(true)}>
          + Add a change
        </button>
      )}
      {full ? (
        <p className={styles.fieldHint}>A scenario can have {CONTRIBUTION_STEP_MAX_COUNT} changes. Remove one to add another.</p>
      ) : null}
    </div>
  )
}

function StepForm({
  steps,
  planStartDate,
  startAmountCents,
  onAdd,
  onCancel,
}: {
  steps: ContributionStep[]
  planStartDate: string
  startAmountCents: number
  onAdd: (step: ContributionStep) => void
  onCancel: () => void
}) {
  const earliest = firstMonthAfter(planStartDate)
  const [from, setFrom] = useState(earliest)
  const [monthlyCents, setMonthlyCents] = useState(startAmountCents)
  const [tried, setTried] = useState(false)

  const problem = ((): string | null => {
    if (from < earliest) {
      return 'A change has to start after the plan starts. To change the starting amount, edit Monthly investing.'
    }
    if (steps.some((s) => s.from === from)) return `There is already a change from ${shortMonthYearLabel(from)}.`
    return null
  })()

  function submit() {
    setTried(true)
    if (problem) return
    onAdd({ from, monthlyCents })
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
          Add
        </button>
        <button type="button" className={styles.lifeEventCancelBtn} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
