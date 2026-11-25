import type { ContributionStep } from '../../../types'
import { CONTRIBUTION_STEP_MAX_COUNT, shortDateLabel, shortMonthYearLabel, type MoneyFormat } from '../../../engine'
import { StepForm } from './StepForm'
import { amountLabel, firstMonthAfter } from './stepMonths'
import type { StepsProps } from './ContributionSteps'
import styles from './goals.module.css'

/** What a change's row holds: the month it starts, the amount, and the buttons to edit (with a plan start) and remove it. */
function StepRow({
  step,
  planStartDate,
  format,
  onEdit,
  onRemove,
}: {
  step: ContributionStep
  planStartDate: string | null
  format: MoneyFormat
  onEdit: () => void
  onRemove: () => void
}) {
  return (
    <>
      <span className={styles.lifeEventStepLabel}>from {shortMonthYearLabel(step.from)}</span>
      <span className={step.monthlyCents === 0 ? styles.lifeEventYear : styles.lifeEventInflow}>
        {amountLabel(step.monthlyCents, format)}
      </span>
      <span className={styles.lifeEventRowButtons}>
        {planStartDate !== null ? (
          <button
            type="button"
            className={styles.lifeEventEdit}
            aria-label={`Edit the change from ${shortMonthYearLabel(step.from)}`}
            onClick={onEdit}
          >
            Edit
          </button>
        ) : null}
        <button
          type="button"
          className={styles.lifeEventRemove}
          aria-label={`Remove the change from ${shortMonthYearLabel(step.from)}`}
          onClick={onRemove}
        >
          ×
        </button>
      </span>
    </>
  )
}

/** The first row: the amount the scenario starts with, from the plan start. */
export function StartRow({
  planStartDate,
  baseCents,
  format,
}: Pick<StepsProps, 'planStartDate' | 'baseCents' | 'format'>) {
  return (
    <li className={styles.lifeEventRow}>
      <span className={styles.lifeEventStepLabel}>
        {planStartDate === null ? 'at the start' : `from ${shortDateLabel(planStartDate)}`}
      </span>
      <span className={baseCents === 0 ? styles.lifeEventYear : styles.lifeEventInflow}>
        {amountLabel(baseCents, format)}
      </span>
    </li>
  )
}

/** A change in the list: its row, or the form that edits it (needs a plan start), in the same list item. */
export function StepItem({
  step,
  index,
  steps,
  planStartDate,
  format,
  editing,
  onSave,
  onCancel,
  onEdit,
  onRemove,
}: {
  step: ContributionStep
  index: number
  steps: ContributionStep[]
  planStartDate: string | null
  format: MoneyFormat
  editing: boolean
  onSave: (step: ContributionStep) => void
  onCancel: () => void
  onEdit: () => void
  onRemove: () => void
}) {
  return (
    <li className={styles.lifeEventRow}>
      {editing && planStartDate !== null ? (
        <StepForm
          steps={steps}
          planStartDate={planStartDate}
          initial={step}
          ignoreIndex={index}
          submitLabel="Save"
          onSubmit={onSave}
          onCancel={onCancel}
        />
      ) : (
        <StepRow step={step} planStartDate={planStartDate} format={format} onEdit={onEdit} onRemove={onRemove} />
      )}
    </li>
  )
}

/**
 * Under the list: why a change cannot be added yet, the form for a new one, or the button that opens it, and the
 * line that says when there is no room for another.
 */
export function AddStep({
  steps,
  planStartDate,
  baseCents,
  adding,
  full,
  onAdd,
  onOpen,
  onCancel,
}: Pick<StepsProps, 'steps' | 'planStartDate' | 'baseCents'> & {
  adding: boolean
  full: boolean
  onAdd: (step: ContributionStep) => void
  onOpen: () => void
  onCancel: () => void
}) {
  return (
    <>
      {planStartDate === null ? (
        <p className={styles.fieldHint}>
          A change is counted from the plan start. Set a plan start date under Plan start to add one.
        </p>
      ) : adding ? (
        <StepForm
          steps={steps}
          planStartDate={planStartDate}
          initial={{
            from: firstMonthAfter(planStartDate),
            monthlyCents: steps[steps.length - 1]?.monthlyCents ?? baseCents,
          }}
          submitLabel="Add"
          onSubmit={onAdd}
          onCancel={onCancel}
        />
      ) : (
        <button type="button" className={styles.addLifeEventBtn} disabled={full} onClick={onOpen}>
          + Add a change
        </button>
      )}
      {full ? (
        <p className={styles.fieldHint}>
          A scenario can have {CONTRIBUTION_STEP_MAX_COUNT} changes. Remove one to add another.
        </p>
      ) : null}
    </>
  )
}
