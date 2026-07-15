import { shortDayLabel } from '../format'
import { Money } from './Money'
import { CardPaymentIcon } from '../icons'
import styles from './StatementSummaryRow.module.css'

interface Props {
  name: string
  subtitle?: string | undefined
  amountCents: number
  paid: boolean
  paidOn?: string | undefined
  disabled?: boolean
  onPress?: (() => void) | undefined
}

function statusText(paid: boolean, amountCents: number, paidOn?: string): string {
  if (amountCents === 0) return 'Nothing to settle'
  if (!paid) return 'Due'
  return paidOn ? `Paid · ${shortDayLabel(paidOn)}` : 'Paid'
}

/**
 * Single presentational row for a card statement: icon, name, status, amount.
 * Used identically on Dashboard, Settings, and Transactions — tapping it is
 * the only way to edit a statement's paid state anywhere in the app.
 */
export function StatementSummaryRow({
  name,
  subtitle,
  amountCents,
  paid,
  paidOn,
  disabled = false,
  onPress,
}: Props) {
  const tappable = Boolean(onPress)
  const Tag = tappable ? 'button' : 'div'
  const status = statusText(paid, amountCents, paidOn)
  const meta = subtitle ? `${subtitle} · ${status}` : status

  return (
    <Tag
      type={tappable ? 'button' : undefined}
      className={`${styles.row}${tappable ? ` ${styles.rowButton}` : ''}`}
      aria-label={`${name} statement`}
      {...(tappable ? { onClick: onPress, disabled } : {})}
    >
      <span className={styles.iconWrap} aria-hidden>
        <span className={styles.icon}>
          <CardPaymentIcon />
        </span>
      </span>
      <div className={styles.body}>
        <p className={styles.title}>{name}</p>
        <p className={styles.meta}>{meta}</p>
      </div>
      <Money
        cents={amountCents}
        type={amountCents === 0 ? undefined : 'expense'}
        signed
        className={`${styles.amount}${amountCents === 0 ? ` ${styles.amountMuted}` : ''}`}
      />
    </Tag>
  )
}
