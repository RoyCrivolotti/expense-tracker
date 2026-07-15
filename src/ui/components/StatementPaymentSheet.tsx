import type { StatementPaymentRow as StatementPaymentRowData } from '../../engine'
import { fullMonthLabel } from '../../engine'
import { Modal } from './Modal'
import { Money } from './Money'
import { StatementPaidDate } from './StatementPaidDate'
import styles from './StatementPaymentSheet.module.css'

interface Props {
  row: StatementPaymentRowData
  disabled?: boolean
  onSave: (
    accountId: number,
    yearMonth: string,
    paid: boolean,
    paidOn?: string,
  ) => Promise<void>
  onClose: () => void
}

export function StatementPaymentSheet({ row, disabled = false, onSave, onClose }: Props) {
  const persist = async (paid: boolean, paidOn?: string) => {
    await onSave(row.cardAccountId, row.budgetMonth, paid, paidOn)
    if (!paid) onClose()
  }

  return (
    <Modal
      title={`${row.cardName} statement`}
      subtitle={fullMonthLabel(row.budgetMonth)}
      onClose={onClose}
    >
      <p className={styles.amountRow}>
        Charge <Money cents={row.amountCents} type="expense" signed />
      </p>
      <StatementPaidDate
        paid
        paidOn={row.date}
        disabled={disabled}
        onMarkPaid={(paidOn) => void persist(true, paidOn)}
        onEditDate={(paidOn) => void persist(true, paidOn)}
        onMarkDue={() => void persist(false)}
      />
      <p className={styles.hint}>
        Paid date controls where this debit appears in Transactions.
      </p>
    </Modal>
  )
}
