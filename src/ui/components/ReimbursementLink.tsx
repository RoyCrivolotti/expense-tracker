import type { Transaction } from '../../types'
import { formatCents } from '../../engine/money'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import { formatDayLabel, type Lookup } from '../format'
import styles from './TransactionForm.module.css'

interface Props {
  editing: Transaction
  lookup: Lookup
  onOpen: (txn: Transaction) => void
}

/**
 * The other half of a reimbursement, from whichever side you opened.
 *
 * Both directions matter and neither was visible before: opening a claimed
 * expense told you nothing about having been paid back for it, and opening the
 * payment told you nothing about what it covered.
 */
export function ReimbursementLink({ editing, lookup, onOpen }: Props) {
  const format = useMoneyFormat()
  const settlement = lookup.settlementFor(editing.id)
  const covered = lookup.settledBy(editing.id)

  if (settlement) {
    return (
      <button
        type="button"
        className={styles.linkButton}
        onClick={() => onOpen(settlement)}
      >
        Reimbursed {formatDayLabel(settlement.date)} ·{' '}
        {formatCents(settlement.amountCents, format)}
      </button>
    )
  }

  if (covered.length > 0) {
    const total = covered.reduce(
      (sum, t) => sum + (t.type === 'refund' ? -t.amountCents : t.amountCents),
      0,
    )
    return (
      <button
        type="button"
        className={styles.linkButton}
        onClick={() => onOpen(covered[0]!)}
        // The first row is a way in rather than the whole answer; the label
        // carries the count so the button does not claim to be only about one.
        aria-label={`Reimburses ${covered.length} transactions. Open the first.`}
      >
        Reimburses {covered.length} transaction{covered.length === 1 ? '' : 's'} ·{' '}
        {formatCents(total, format)}
      </button>
    )
  }

  return null
}
