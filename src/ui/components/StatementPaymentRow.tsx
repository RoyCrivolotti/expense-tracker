import type { StatementPaymentRow as StatementPaymentRowData } from '../../engine'
import { fullMonthLabel } from '../../engine'
import { shortDayLabel } from '../format'
import { Money } from './Money'
import { CardPaymentIcon } from '../icons'
import styles from './StatementPaymentRow.module.css'

interface Props {
  row: StatementPaymentRowData
  showDate?: boolean
  onPress?: () => void
}

export function StatementPaymentRow({ row, showDate = false, onPress }: Props) {
  const paidLabel = shortDayLabel(row.date)
  const Tag = onPress ? 'button' : 'div'
  return (
    <Tag
      type={onPress ? 'button' : undefined}
      className={`${styles.row}${onPress ? ` ${styles.rowButton}` : ''}`}
      aria-label={`${row.cardName} statement payment`}
      {...(onPress ? { onClick: onPress } : {})}
    >
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
    </Tag>
  )
}
