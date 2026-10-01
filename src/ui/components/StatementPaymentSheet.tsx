import { useState } from 'react'
import { fullMonthLabel } from '../../engine'
import { todayLocalIso } from '../dates'
import { failureMessage } from '../hooks/useFailureToast'
import { usePopoverTrapPause } from '../hooks/usePopoverTrapPause'
import { DateInput } from './DateInput'
import { Modal } from './Modal'
import { Money } from './Money'
import { Pill } from './primitives'
import { Field } from './TransactionFields'
import formStyles from './TransactionForm.module.css'
import styles from './StatementPaymentSheet.module.css'

interface Props {
  cardName: string
  yearMonth: string
  amountCents: number
  paid: boolean
  paidOn?: string | undefined
  disabled?: boolean
  onSave: (paid: boolean, paidOn?: string) => Promise<void>
  onClose: () => void
}

export function StatementPaymentSheet({
  cardName,
  yearMonth,
  amountCents,
  paid,
  paidOn,
  disabled = false,
  onSave,
  onClose,
}: Props) {
  // While the statement is due the date is only a draft, sent with "Mark as paid". Once it
  // is paid the date is the saved one, and picking another saves at once.
  const [draftDate, setDraftDate] = useState(todayLocalIso)
  const [error, setError] = useState<string | null>(null)
  // Pauses this Modal's own trap while the date popover is open, the same way
  // TransactionModal does for its fields — otherwise Escape closes both at once.
  const [datePopoverOpen, setDatePopoverOpen] = usePopoverTrapPause()

  // The sheet stays open when the save fails, so the user can see why and try again.
  const persist = async (nextPaid: boolean, nextPaidOn: string | undefined, closeAfter: boolean) => {
    setError(null)
    try {
      await onSave(nextPaid, nextPaidOn)
    } catch (e) {
      setError(failureMessage(e))
      return
    }
    if (closeAfter) onClose()
  }

  const pickDate = (iso: string) => {
    // A paid statement without a date is rejected by the server, so a blank is never saved.
    if (!iso) return
    if (!paid) setDraftDate(iso)
    else if (iso !== paidOn) void persist(true, iso, false)
  }

  return (
    <Modal
      title={`${cardName} statement`}
      subtitle={fullMonthLabel(yearMonth)}
      onClose={onClose}
      trapPaused={datePopoverOpen}
    >
      <p className={styles.amountRow}>
        <span>
          Charge <Money cents={amountCents} type="expense" signed />
        </span>
        <Pill tone={paid ? 'success' : 'warning'}>{paid ? 'Paid' : 'Due'}</Pill>
      </p>
      <Field label="Paid on" as="div">
        <DateInput
          value={paid ? (paidOn ?? '') : draftDate}
          ariaLabel="Statement paid on"
          disabled={disabled}
          onChange={pickDate}
          onTrapPausedChange={setDatePopoverOpen}
        />
      </Field>
      <p className={styles.hint}>Paid date controls where this debit appears in Transactions.</p>
      {error ? (
        <p className={formStyles.error} role="alert">
          {error}
        </p>
      ) : null}
      <div className={formStyles.actions}>
        {paid ? (
          <button
            type="button"
            className={`${styles.secondary} tapActive`}
            disabled={disabled}
            onClick={() => void persist(false, undefined, true)}
          >
            Mark as due
          </button>
        ) : (
          <button
            type="button"
            className={`${styles.primary} tapActive`}
            disabled={disabled}
            onClick={() => void persist(true, draftDate, true)}
          >
            Mark as paid
          </button>
        )}
      </div>
    </Modal>
  )
}
