import type { ExpenseSettings } from '../../types'
import { Card } from '../components/primitives'
import styles from '../tabs/tabs.module.css'
import goalStyles from '../tabs/goals/goals.module.css'

/** Mirrors the server's bound; a typo past it is refused there too. */
const MAX_MONTHS = 60

interface Props {
  settings: ExpenseSettings
  onChange: (patch: Partial<ExpenseSettings>) => void | Promise<void>
}

/** The emergency-fund target, in months of spending. Zero switches the comparison off. */
export function CashReserveSetting({ settings, onChange }: Props) {
  return (
    <Card>
      <h3 className={goalStyles.sectionTitle}>Cash reserve</h3>
      <div className={styles.settingGroup}>
        <label className={styles.defaultAccountField}>
          <span className={styles.defaultAccountLabel}>Months of spending to hold in cash</span>
          <input
            className={styles.defaultAccountSelect}
            type="number"
            min={0}
            max={MAX_MONTHS}
            step={1}
            value={settings.cashReserveMonths}
            onChange={(e) => {
              const months = Number(e.target.value)
              if (Number.isInteger(months) && months >= 0 && months <= MAX_MONTHS) {
                void onChange({ cashReserveMonths: months })
              }
            }}
          />
        </label>
        <p className={styles.settingHint}>
          Progress sets the cash accounts in your latest check-in against your average monthly
          spending and says how many months they cover. With a target it says whether you are
          there yet; 0 leaves the target off.
        </p>
      </div>
    </Card>
  )
}
