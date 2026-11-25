import { useState } from 'react'
import type { ContributionStep } from '../../../types'
import { CONTRIBUTION_STEP_MAX_COUNT, normalizeContributionSchedule, type MoneyFormat } from '../../../engine'
import { AddStep, StartRow, StepItem } from './StepRows'
import styles from './goals.module.css'

export interface StepsProps {
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

  function saveStep(
    index: number,
    step: ContributionStep,
  ) {
    onChange(normalizeContributionSchedule(steps.map((s, i) => (i === index ? step : s))))
    setEditing(null)
  }

  return (
    <div>
      <ul className={styles.lifeEventList}>
        <StartRow planStartDate={planStartDate} baseCents={baseCents} format={format} />
        {steps.map((step, index) => (
          <StepItem
            key={step.from}
            step={step}
            index={index}
            steps={steps}
            planStartDate={planStartDate}
            format={format}
            editing={editing === index}
            onSave={(next) => saveStep(index, next)}
            onCancel={() => setEditing(null)}
            onEdit={() => {
              setAdding(false)
              setEditing(index)
            }}
            onRemove={() => removeStep(index)}
          />
        ))}
      </ul>
      <p className={styles.fieldHint}>The first line is the amount you start with, set in {startSetIn}.</p>
      <AddStep
        steps={steps}
        planStartDate={planStartDate}
        baseCents={baseCents}
        adding={adding}
        full={full}
        onAdd={addStep}
        onOpen={() => {
          setEditing(null)
          setAdding(true)
        }}
        onCancel={() => setAdding(false)}
      />
    </div>
  )
}
