import type { StatementPaymentRow as StatementPaymentRowData } from '../../engine'
import { formatCents, fullMonthLabel } from '../../engine'
import { CardPaymentIcon } from '../icons'
import styles from './StatementPaymentRow.module.css'

interface Props {
  row: StatementPaymentRowData
  showDate?: boolean
}

export function StatementPaymentRow({ row, showDate = false }: Props) {
  return (
    <div className={styles.row} aria-label={`${row.cardName} statement payment`}>
      <span className={styles.iconWrap} aria-hidden>
        <span className={styles.icon}>
          <CardPaymentIcon />
        </span>
      </span>
      <div className={styles.body}>
        <p className={styles.title}>{row.cardName} statement</p>
        <p className={styles.meta}>
          {fullMonthLabel(row.budgetMonth)}
          {showDate ? ` · ${row.date}` : ''}
        </p>
      </div>
      <span className={styles.amount}>−{formatCents(row.amountCents, false)}</span>
    </div>
  )
}
