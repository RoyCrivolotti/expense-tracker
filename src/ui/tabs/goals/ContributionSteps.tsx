import { useState } from 'react'
import type { ContributionStep } from '../../../types'
import {
  CONTRIBUTION_STEP_MAX_COUNT,
  formatCents,
  normalizeContributionSchedule,
  shortDateLabel,
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
  /** Where the starting amount is edited, for the line under its row: "the bar above" or "Portfolio". */
  startSetIn: string
  format: MoneyFormat
  onChange: (steps: ContributionStep[]) => void
}

/** The month after the one the plan starts in, which is the earliest a change can begin. */
function firstMonthAfter(planStartDate: string): string {
  const [year = 0, month = 1] = planStartDate.split('-').map(Number)
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }
  return `${next.year}-${String(next.month).padStart(2, '0')}`
}

/** An amount a month, or "pause" for none: nothing is sent, which is not the same as 0,00 € a month. */
function amountLabel(cents: number, format: MoneyFormat): string {
  return cents === 0 ? 'pause' : `${formatCents(cents, format)}/mo`
}

/**
 * What a scenario sends each month over time, read as a history: the amount it starts with on the
 * plan's start date, then each change from a month on ("from March 2028, 2,500 a month"). The
 * starting amount is shown here and edited where every other input is (the bar, or Portfolio); the
 * changes are added, edited and removed. Needs the plan start, which is what a month is counted from.
 */
export function ContributionStepsList({ steps, planStartDate, baseCents, startSetIn, format, onChange }: StepsProps) {
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<number | null>(null)
  const full = steps.length >= CONTRIBUTION_STEP_MAX_COUNT

  function removeStep(index: number) {
    onChange(steps.filter((_, i) => i !== index))
  }

  function addStep(step: ContributionStep) {
    onChange(normalizeContributionSchedule([...steps, step]))
    setAdding(false)
  }

  function saveStep(index: number, step: ContributionStep) {
    onChange(normalizeContributionSchedule(steps.map((s, i) => (i === index ? step : s))))
    setEditing(null)
  }

  return (
    <div>
      <ul className={styles.lifeEventList}>
        <li className={styles.lifeEventRow}>
          <span className={styles.lifeEventLabel}>
            {planStartDate === null ? 'at the start' : `from ${shortDateLabel(planStartDate)}`}
          </span>
          <span className={baseCents === 0 ? styles.lifeEventYear : styles.lifeEventInflow}>{amountLabel(baseCents, format)}</span>
        </li>
        {steps.map((step, index) =>
          editing === index && planStartDate !== null ? (
            <li key={step.from} className={styles.lifeEventRow}>
              <StepForm
                steps={steps}
                planStartDate={planStartDate}
                initial={step}
                ignoreIndex={index}
                submitLabel="Save"
                onSubmit={(next) => saveStep(index, next)}
                onCancel={() => setEditing(null)}
              />
            </li>
          ) : (
            <li key={step.from} className={styles.lifeEventRow}>
              <span className={styles.lifeEventLabel}>from {shortMonthYearLabel(step.from)}</span>
              <span className={step.monthlyCents === 0 ? styles.lifeEventYear : styles.lifeEventInflow}>
                {amountLabel(step.monthlyCents, format)}
              </span>
              {planStartDate !== null ? (
                <button
                  type="button"
                  className={styles.lifeEventEdit}
                  aria-label={`Edit the change from ${shortMonthYearLabel(step.from)}`}
                  onClick={() => {
                    setAdding(false)
                    setEditing(index)
                  }}
                >
                  Edit
                </button>
              ) : null}
              <button
                type="button"
                className={styles.lifeEventRemove}
                aria-label={`Remove the change from ${shortMonthYearLabel(step.from)}`}
                onClick={() => removeStep(index)}
              >
                ×
              </button>
            </li>
          ),
        )}
      </ul>
      <p className={styles.fieldHint}>The first line is the amount you start with, set in {startSetIn}.</p>
      {planStartDate === null ? (
        <p className={styles.fieldHint}>
          A change is counted from the plan start. Set a plan start date under Plan start to add one.
        </p>
      ) : adding ? (
        <StepForm
          steps={steps}
          planStartDate={planStartDate}
          initial={{ from: firstMonthAfter(planStartDate), monthlyCents: steps[steps.length - 1]?.monthlyCents ?? baseCents }}
          submitLabel="Add"
          onSubmit={addStep}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button
          type="button"
          className={styles.addLifeEventBtn}
          disabled={full}
          onClick={() => {
            setEditing(null)
            setAdding(true)
          }}
        >
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
  const earliest = firstMonthAfter(planStartDate)
  const [from, setFrom] = useState(initial.from)
  const [monthlyCents, setMonthlyCents] = useState(initial.monthlyCents)
  const [tried, setTried] = useState(false)

  const problem = ((): string | null => {
    if (from < earliest) {
      return 'A change has to start after the plan starts. To change the starting amount, edit Monthly investing.'
    }
    if (steps.some((s, i) => i !== ignoreIndex && s.from === from)) {
      return `There is already a change from ${shortMonthYearLabel(from)}.`
    }
    return null
  })()

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
