import { fullMonthLabel } from '../../engine'
import { Modal } from './Modal'
import { Money } from './Money'
import { StatementPaidDate } from './StatementPaidDate'
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
  const persist = async (nextPaid: boolean, nextPaidOn?: string) => {
    await onSave(nextPaid, nextPaidOn)
    if (!nextPaid) onClose()
  }

  return (
    <Modal title={`${cardName} statement`} subtitle={fullMonthLabel(yearMonth)} onClose={onClose}>
      <p className={styles.amountRow}>
        Charge <Money cents={amountCents} type="expense" signed />
      </p>
      <StatementPaidDate
        paid={paid}
        paidOn={paidOn}
        disabled={disabled}
        onMarkPaid={(next) => void persist(true, next)}
        onEditDate={(next) => void persist(true, next)}
        onMarkDue={() => void persist(false)}
      />
      <p className={styles.hint}>Paid date controls where this debit appears in Transactions.</p>
    </Modal>
  )
}
