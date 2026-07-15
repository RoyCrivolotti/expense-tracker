import { todayLocalIso } from '../dates'
import { StatementPaidToggle } from './StatementPaidToggle'
import styles from './StatementPaidDate.module.css'

interface Props {
  paid: boolean
  paidOn?: string | undefined
  disabled?: boolean
  onMarkPaid: (paidOn: string) => void
  onEditDate: (paidOn: string) => void
  onMarkDue: () => void
}

export function StatementPaidDate({
  paid,
  paidOn,
  disabled = false,
  onMarkPaid,
  onEditDate,
  onMarkDue,
}: Props) {
  if (!paid) {
    return (
      <StatementPaidToggle
        paid={false}
        disabled={disabled}
        onToggle={() => onMarkPaid(todayLocalIso())}
      />
    )
  }

  const commitDate = (raw: string) => {
    if (!raw) {
      onMarkDue()
      return
    }
    if (raw !== paidOn) onEditDate(raw)
  }

  return (
    <div className={styles.paidRow}>
      <StatementPaidToggle paid disabled={disabled} onToggle={onMarkDue} />
      <input
        type="date"
        className={styles.dateInput}
        defaultValue={paidOn ?? ''}
        key={paidOn ?? 'empty'}
        disabled={disabled}
        aria-label="Statement paid on"
        onBlur={(e) => commitDate(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
      />
    </div>
  )
}
