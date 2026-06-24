import { Pill } from './primitives'
import styles from './StatementPaidToggle.module.css'

interface StatementPaidToggleProps {
  paid: boolean
  disabled?: boolean
  onToggle?: (() => void) | undefined
}

export function StatementPaidToggle({ paid, disabled, onToggle }: StatementPaidToggleProps) {
  if (onToggle == null) {
    return <Pill tone={paid ? 'success' : 'warning'}>{paid ? 'Paid' : 'Due'}</Pill>
  }

  return (
    <button
      type="button"
      className={styles.btn}
      disabled={disabled}
      aria-pressed={paid}
      onClick={onToggle}
    >
      <Pill tone={paid ? 'success' : 'warning'}>{paid ? 'Paid' : 'Due'}</Pill>
    </button>
  )
}
