import { todayLocalIso } from '../dates'
import { StatementPaidToggle } from './StatementPaidToggle'
import styles from './StatementPaidDate.module.css'

interface Props {
  paid: boolean
  paidOn?: string | undefined
  disabled?: boolean
  readOnly?: boolean
  onMarkPaid: (paidOn: string) => void
  onEditDate: (paidOn: string) => void
  onMarkDue: () => void
}

export function StatementPaidDate({
  paid,
  paidOn,
  disabled = false,
  readOnly = false,
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
    if (raw && raw !== paidOn) onEditDate(raw)
  }

  return (
    <div className={styles.paidRow}>
      <StatementPaidToggle paid disabled={disabled} onToggle={onMarkDue} />
      {readOnly ? (
        <span className={styles.dateReadonly}>{paidOn ?? '—'}</span>
      ) : (
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
      )}
    </div>
  )
}
