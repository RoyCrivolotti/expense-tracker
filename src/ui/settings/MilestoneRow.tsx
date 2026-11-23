import { useEffect, useRef, useState } from 'react'
import type { Milestone } from '../../types'
import {
  formatMoneyInput,
  MILESTONE_LABEL_MAX_LENGTH,
  MILESTONE_MAX_CENTS,
  tryParseMoneyToCents,
  type MoneyFormat,
} from '../../engine'
import { DateInput } from '../components/DateInput'
import styles from '../tabs/tabs.module.css'

interface RowProps {
  milestone: Milestone
  format: MoneyFormat
  formatted: string
  isAmountTaken: (amountCents: number) => boolean
  onCommit: (
    amountCents: number,
    next: Milestone,
  ) => void
  onRemove: () => void
  /** The row whose save last failed, and a count so the same row can fail twice. */
  failed: { amountCents: number; n: number } | null
}

/** What a row keeps while it is being edited: the typed label and amount, and the commit that sends them up. */
function useMilestoneRow({
  milestone,
  format,
  isAmountTaken,
  onCommit,
  failed,
}: Omit<RowProps, 'formatted' | 'onRemove'>) {
  const [label, setLabel] = useState(milestone.label)
  const [amount, setAmount] = useState(formatMoneyInput(milestone.amountCents, format))
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

  // Read through a ref so the reset below runs only when a save failed, not on every
  // change to the prop, which would wipe what is being typed in another row's wake.
  const savedRef = useRef(milestone)
  const formatRef = useRef(format)
  useEffect(() => {
    savedRef.current = milestone
    formatRef.current = format
  })
  useEffect(() => {
    // Only the row whose edit was refused goes back; another row's typing is untouched.
    const saved = savedRef.current
    if (failed === null || failed.amountCents !== saved.amountCents) return
    setLabel(saved.label)
    setAmount(formatMoneyInput(saved.amountCents, formatRef.current))
    keyRef.current = saved.amountCents
    targetRef.current = saved.targetDate ?? ''
  }, [failed])

  function resolveAmountCents(): number {
    // Read the way the rest of the app reads an amount, by the currency's format: "150.000" is a
    // hundred and fifty thousand where the group mark is the point, and "1,5" is one and a half
    // where it is not. A plain Number() read the first as 150 and dropped the second.
    const cents = tryParseMoneyToCents(amount, format)
    if (cents === null || cents <= 0) return milestone.amountCents
    const next = Math.min(MILESTONE_MAX_CENTS, cents)
    // Saving a duplicate would let the server's de-duplication drop this row and
    // its label without the edit ever being visible, so collisions revert. The row's
    // own last commit is not a collision, even while it is still in flight.
    return next !== keyRef.current && isAmountTaken(next) ? keyRef.current : next
  }

  function commit(nextTarget = targetRef.current) {
    const amountCents = resolveAmountCents()
    setAmount(formatMoneyInput(amountCents, format))
    onCommit(keyRef.current, { amountCents, label, ...(nextTarget ? { targetDate: nextTarget } : {}) })
    keyRef.current = amountCents
    targetRef.current = nextTarget
  }

  return { label, setLabel, amount, setAmount, targetDate, commit }
}

function TargetDate({
  targetDate,
  description,
  onCommit,
}: {
  targetDate: string
  description: string
  onCommit: (targetDate: string) => void
}) {
  return (
    <>
      {/* Optional: with a date, Progress can say on track or late instead of only reached. */}
      <span className={styles.milestoneTarget}>
        <DateInput
          value={targetDate}
          placeholder="Target date"
          ariaLabel={`Target date for milestone ${description}`}
          onChange={(iso) => onCommit(iso)}
        />
        {targetDate ? (
          <button
            type="button"
            className={styles.milestoneRemove}
            aria-label={`Clear target date for milestone ${description}`}
            onClick={() => onCommit('')}
          >
            ×
          </button>
        ) : null}
      </span>
    </>
  )
}

export function MilestoneRow({ milestone, format, formatted, isAmountTaken, onCommit, onRemove, failed }: RowProps) {
  const { label, setLabel, amount, setAmount, targetDate, commit } = useMilestoneRow({
    milestone,
    format,
    isAmountTaken,
    onCommit,
    failed,
  })

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
        type="text"
        inputMode="decimal"
        aria-label={`Milestone amount in ${format.symbol}`}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        onBlur={() => commit()}
      />
      <span className={styles.milestoneFormatted}>{formatted}</span>
      <TargetDate targetDate={targetDate} description={milestone.label || formatted} onCommit={commit} />
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
