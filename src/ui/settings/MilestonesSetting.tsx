import { useEffect, useRef, useState } from 'react'
import type { ExpenseSettings, Milestone } from '../../types'
import {
  defaultMilestones,
  formatCents,
  MILESTONE_LABEL_MAX_LENGTH,
  MILESTONE_MAX_CENTS,
  MILESTONE_MAX_COUNT,
  resolveMoneyFormat,
} from '../../engine'
import { Card } from '../components/primitives'
import { DateInput } from '../components/DateInput'
import styles from '../tabs/tabs.module.css'
import goalStyles from '../tabs/goals/goals.module.css'

interface Props {
  settings: ExpenseSettings
  /** Returning the save promise lets the editor keep overlapping edits from clobbering each other. */
  onChange: (patch: Partial<ExpenseSettings>) => void | Promise<void>
}

/** Amount to prefill a new row with: a step above the current top of the ladder. */
function suggestedAmountCents(milestones: Milestone[]): number {
  const top = milestones[milestones.length - 1]?.amountCents ?? 0
  return Math.min(MILESTONE_MAX_CENTS, top + 10_000_000)
}

function MilestoneRow({
  milestone,
  currencySymbol,
  formatted,
  isAmountTaken,
  onCommit,
  onRemove,
}: {
  milestone: Milestone
  currencySymbol: string
  formatted: string
  isAmountTaken: (amountCents: number) => boolean
  onCommit: (next: Milestone) => void
  onRemove: () => void
}) {
  const [label, setLabel] = useState(milestone.label)
  const [amount, setAmount] = useState(String(milestone.amountCents / 100))
  const targetDate = milestone.targetDate ?? ''

  function resolveAmountCents(): number {
    const units = Number(amount)
    if (!Number.isFinite(units) || units <= 0) return milestone.amountCents
    const next = Math.min(MILESTONE_MAX_CENTS, Math.round(units * 100))
    // Saving a duplicate would let the server's de-duplication drop this row and
    // its label without the edit ever being visible, so collisions revert.
    return isAmountTaken(next) ? milestone.amountCents : next
  }

  function commit(nextTarget = targetDate) {
    const amountCents = resolveAmountCents()
    setAmount(String(amountCents / 100))
    onCommit({ amountCents, label, ...(nextTarget ? { targetDate: nextTarget } : {}) })
  }

  return (
    <li className={styles.milestoneRow}>
      <input
        className={styles.milestoneLabelInput}
        type="text"
        aria-label="Milestone name"
        placeholder="Unnamed"
        value={label}
        maxLength={MILESTONE_LABEL_MAX_LENGTH}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => commit()}
      />
      <input
        className={styles.milestoneAmountInput}
        type="number"
        aria-label={`Milestone amount in ${currencySymbol}`}
        min={1}
        step={1000}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        onBlur={() => commit()}
      />
      <span className={styles.milestoneFormatted}>{formatted}</span>
      {/* Optional: with a date, Progress can say on track or late instead of only reached. */}
      <span className={styles.milestoneTarget}>
        <DateInput
          value={targetDate}
          ariaLabel={`Target date for milestone ${milestone.label || formatted}`}
          onChange={(iso) => commit(iso)}
        />
        {targetDate ? (
          <button
            type="button"
            className={styles.milestoneRemove}
            aria-label={`Clear target date for milestone ${milestone.label || formatted}`}
            onClick={() => commit('')}
          >
            ×
          </button>
        ) : null}
      </span>
      <button
        type="button"
        className={styles.milestoneRemove}
        aria-label={`Remove milestone ${milestone.label || formatted}`}
        onClick={onRemove}
      >
        ×
      </button>
    </li>
  )
}

/** Owner-wide net-worth milestones shown on the Goals charts and matrix. */
export function MilestonesSetting({ settings, onChange }: Props) {
  const format = resolveMoneyFormat(settings.currencyCode, settings.numberLocale)
  const milestones = settings.milestones

  // Each save sends the whole list, so building one from the last render would
  // let a second edit overwrite a first that is still in flight. This holds the
  // working list and updates synchronously, ahead of the server round-trip.
  const workingRef = useRef(milestones)
  const inFlight = useRef(0)

  useEffect(() => {
    if (inFlight.current === 0) workingRef.current = milestones
  }, [milestones])

  const save = async (next: Milestone[]) => {
    const previous = workingRef.current
    workingRef.current = next
    inFlight.current += 1
    try {
      await onChange({ milestones: next })
    } catch {
      workingRef.current = previous
    } finally {
      inFlight.current -= 1
    }
  }

  // Addressed by amount rather than index: the working list can already differ
  // from the rendered one while a save is in flight.
  const replaceAmount = (amountCents: number, next: Milestone) =>
    void save(workingRef.current.map((m) => (m.amountCents === amountCents ? next : m)))
  const removeAmount = (amountCents: number) =>
    void save(workingRef.current.filter((m) => m.amountCents !== amountCents))

  return (
    <>
      <Card>
        {/* Same card title as the accounts card beside it in Setup, not a page heading. */}
        <h3 className={goalStyles.sectionTitle}>Milestones</h3>
        <div className={styles.settingGroup}>
          <p className={styles.settingHint}>
            Net-worth targets shown on the Goals charts and the years-to-milestone matrix, measured
            against your invested portfolio. Names are optional, and a named milestone is shown with
            its amount alongside; an unnamed one shows the amount on its own. Give one a target date
            and Progress will say whether the plan reaches it in time.
          </p>

          {milestones.length > 0 ? (
            <ul className={styles.milestoneList}>
              {milestones.map((m) => (
                <MilestoneRow
                  key={m.amountCents}
                  milestone={m}
                  currencySymbol={format.symbol}
                  formatted={formatCents(m.amountCents, format)}
                  isAmountTaken={(cents) =>
                    cents !== m.amountCents &&
                    workingRef.current.some((other) => other.amountCents === cents)
                  }
                  onCommit={(next) => replaceAmount(m.amountCents, next)}
                  onRemove={() => removeAmount(m.amountCents)}
                />
              ))}
            </ul>
          ) : (
            <p className={styles.settingHint}>
              No milestones. The Goals matrix and chart reference lines stay empty until you add
              one.
            </p>
          )}

          <div className={styles.milestoneActions}>
            <button
              type="button"
              className={styles.milestoneAddBtn}
              disabled={milestones.length >= MILESTONE_MAX_COUNT}
              onClick={() =>
                void save([
                  ...workingRef.current,
                  { amountCents: suggestedAmountCents(workingRef.current), label: '' },
                ])
              }
            >
              + Add milestone
            </button>
            <button
              type="button"
              className={styles.milestoneResetBtn}
              onClick={() => void save(defaultMilestones())}
            >
              Reset to defaults
            </button>
          </div>
          {milestones.length >= MILESTONE_MAX_COUNT ? (
            <p className={styles.settingHint}>
              {MILESTONE_MAX_COUNT} is the most the matrix can show legibly. Remove one to add
              another.
            </p>
          ) : null}
        </div>
      </Card>
    </>
  )
}
