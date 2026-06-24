import type { ActiveFilterChip } from './txnFilterChips'
import styles from './tabs.module.css'

export function ActiveFilterChips({ chips }: { chips: ActiveFilterChip[] }) {
  if (chips.length === 0) return null
  return (
    <div className={styles.filterChips}>
      {chips.map((chip) => (
        <button key={chip.key} type="button" className={styles.filterChip} onClick={chip.onClear}>
          {chip.label} ×
        </button>
      ))}
    </div>
  )
}
