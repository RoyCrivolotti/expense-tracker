import type { ActiveFilterChip } from './txnFilterChips'
import styles from './tabs.module.css'

/**
 * `disabled` while rows are being selected: each chip clears its filter, and clearing the
 * date scope narrows the list, which would hide rows that are already chosen.
 */
export function ActiveFilterChips({
  chips,
  disabled = false,
}: {
  chips: ActiveFilterChip[]
  disabled?: boolean
}) {
  if (chips.length === 0) return null
  return (
    <div className={styles.filterChips}>
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          className={styles.filterChip}
          onClick={chip.onClear}
          disabled={disabled}
        >
          {chip.label} ×
        </button>
      ))}
    </div>
  )
}
