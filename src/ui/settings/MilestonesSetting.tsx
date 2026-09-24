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
  onCommit: (amountCents: number, next: Milestone) => void
  onRemove: () => void
}) {
  const [label, setLabel] = useState(milestone.label)
  const [amount, setAmount] = useState(String(milestone.amountCents / 100))
  // The row is addressed by amount. After the amount itself is edited the working list
  // already holds the new one while the prop still has the old, so a date picked in that
  // gap must address the new amount or it would match nothing and be lost.
  const keyRef = useRef(milestone.amountCents)
  const targetDate = milestone.targetDate ?? ''
  // The date the row last committed, for the same reason: a rename right after a date
  // pick must carry the date even though the prop has not caught up with it yet.
  const targetRef = useRef(targetDate)
  useEffect(() => {
    targetRef.current = targetDate
  }, [targetDate])

  function resolveAmountCents(): number {
    const units = Number(amount)
    if (!Number.isFinite(units) || units <= 0) return milestone.amountCents
    const next = Math.min(MILESTONE_MAX_CENTS, Math.round(units * 100))
    // Saving a duplicate would let the server's de-duplication drop this row and
    // its label without the edit ever being visible, so collisions revert. The row's
    // own last commit is not a collision, even while it is still in flight.
    return next !== keyRef.current && isAmountTaken(next) ? keyRef.current : next
  }

  function commit(nextTarget = targetRef.current) {
    const amountCents = resolveAmountCents()
    setAmount(String(amountCents / 100))
    onCommit(keyRef.current, { amountCents, label, ...(nextTarget ? { targetDate: nextTarget } : {}) })
    keyRef.current = amountCents
    targetRef.current = nextTarget
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
          placeholder="Target date"
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
  const latestSave = useRef(0)
  // A save that fails would otherwise fail in silence: the input keeps the edit while
  // the server never got it.
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (inFlight.current === 0) workingRef.current = milestones
  }, [milestones])

  const save = async (next: Milestone[]) => {
    const previous = workingRef.current
    workingRef.current = next
    inFlight.current += 1
    const seq = ++latestSave.current
    setError(null)
    try {
      await onChange({ milestones: next })
    } catch (e) {
      // A later save was built on this list and carried this edit with it; if that one
      // landed, rolling back here would discard what the server already holds.
      if (seq === latestSave.current) {
        workingRef.current = previous
        setError(e instanceof Error ? e.message : 'Could not save the milestones')
      }
    } finally {
      inFlight.current -= 1
    }
  }

  // Addressed by amount rather than index: the working list can already differ
  // from the rendered one while a save is in flight. A row addresses itself by the
  // amount it last committed; after a failed save that amount is gone from the working
  // list again, so the row falls back to its saved one and the retry carries the edit.
  const replaceAmount = (key: number, savedAmountCents: number, next: Milestone) => {
    const known = workingRef.current.some((m) => m.amountCents === key) ? key : savedAmountCents
    void save(workingRef.current.map((m) => (m.amountCents === known ? next : m)))
  }
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
                  onCommit={(key, next) => replaceAmount(key, m.amountCents, next)}
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

          {error ? (
            <p className={styles.settingError} role="alert">
              Could not save the milestones: {error}
            </p>
          ) : null}
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
