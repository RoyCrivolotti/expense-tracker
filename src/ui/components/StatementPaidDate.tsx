import { todayLocalIso } from '../dates'
import { DateInput } from './DateInput'
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

  return (
    <div className={styles.paidRow}>
      <StatementPaidToggle paid disabled={disabled} onToggle={onMarkDue} />
      <DateInput
        value={paidOn ?? ''}
        ariaLabel="Statement paid on"
        disabled={disabled}
        onChange={(v) => {
          if (!v) { onMarkDue(); return }
          if (v !== paidOn) onEditDate(v)
        }}
      />
    </div>
  )
}
