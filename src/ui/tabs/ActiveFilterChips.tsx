import type { ActiveFilterChip } from './txnFilterChips'
import styles from './tabs.module.css'

/**
 * `locked` while rows are being selected: each chip clears its filter, and clearing the date
 * scope narrows the list, which would hide rows that are already chosen. A locked chip stays
 * pressable so `onLockedPress` can say why.
 */
export function ActiveFilterChips({
  chips,
  locked = false,
  onLockedPress,
}: {
  chips: ActiveFilterChip[]
  locked?: boolean
  onLockedPress?: (() => void) | undefined
}) {
  if (chips.length === 0) return null
  return (
    <div className={styles.filterChips}>
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          className={styles.filterChip}
          onClick={locked ? onLockedPress : chip.onClear}
          {...(locked ? { 'aria-disabled': true } : {})}
        >
          {chip.label} ×
        </button>
      ))}
    </div>
  )
}
