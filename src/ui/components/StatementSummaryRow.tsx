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

/** A statement with nothing to settle is neither due nor paid, so it keeps the muted meta colour. */
function statusTone(paid: boolean, amountCents: number): string | undefined {
  if (amountCents === 0) return undefined
  return paid ? styles.paid : styles.due
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

  return (
    <Tag
      type={tappable ? 'button' : undefined}
      className={`${styles.row}${tappable ? ` ${styles.rowButton}` : ''}`}
      {...(tappable ? { onClick: onPress, disabled } : {})}
    >
      <span className={styles.iconWrap} aria-hidden>
        <span className={styles.icon}>
          <CardPaymentIcon />
        </span>
      </span>
      <div className={styles.body}>
        <p className={styles.title}>{name}</p>
        <p className={styles.meta}>
          {subtitle ? `${subtitle} · ` : ''}
          <span className={statusTone(paid, amountCents)}>{status}</span>
        </p>
      </div>
      <Money
        cents={amountCents}
        type={amountCents === 0 ? undefined : 'expense'}
        signed
        className={`${styles.amount}${amountCents === 0 ? ` ${styles.amountMuted}` : ''}`}
      />
      {tappable ? (
        <span className={styles.chevron} aria-hidden>
          ›
        </span>
      ) : null}
    </Tag>
  )
}
