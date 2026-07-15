import { RefreshIcon } from '../icons'
import styles from './RefreshButton.module.css'

interface Props {
  onRefresh: () => void
  refreshing: boolean
  disabled?: boolean
}

export function RefreshButton({ onRefresh, refreshing, disabled = false }: Props) {
  return (
    <button
      type="button"
      className={`${styles.btn} ${refreshing ? styles.spinning : ''}`}
      onClick={onRefresh}
      disabled={disabled || refreshing}
      aria-label="Refresh data"
    >
      <span className={styles.icon} aria-hidden>
        <RefreshIcon />
      </span>
    </button>
  )
}
