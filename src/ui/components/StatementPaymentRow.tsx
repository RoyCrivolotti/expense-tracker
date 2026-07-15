import type { StatementPaymentRow as StatementPaymentRowData } from '../../engine'
import { fullMonthLabel } from '../../engine'
import { shortDayLabel } from '../format'
import { Money } from './Money'
import { CardPaymentIcon } from '../icons'
import styles from './StatementPaymentRow.module.css'

interface Props {
  row: StatementPaymentRowData
  showDate?: boolean
}

export function StatementPaymentRow({ row, showDate = false }: Props) {
  const paidLabel = shortDayLabel(row.date)
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
          {fullMonthLabel(row.budgetMonth)} · paid {paidLabel}
          {showDate ? ` · ${row.date}` : ''}
        </p>
      </div>
      <Money cents={row.amountCents} type="expense" signed className={styles.amount} />
    </div>
  )
}
