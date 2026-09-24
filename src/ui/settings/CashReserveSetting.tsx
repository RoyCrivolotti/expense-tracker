import { useState } from 'react'
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

/**
 * The emergency-fund target, in months of spending. Zero switches the comparison off.
 * The field holds its own draft and saves on blur or Enter: bound straight to the saved
 * value, each keystroke would race the round trip, and an empty field would save zero.
 */
export function CashReserveSetting({ settings, onChange }: Props) {
  const saved = settings.cashReserveMonths
  const [draft, setDraft] = useState(String(saved))
  // A save landing from elsewhere replaces the draft; tracked in render rather than in
  // an effect so the field never shows the old value for a frame.
  const [seen, setSeen] = useState(saved)
  if (seen !== saved) {
    setSeen(saved)
    setDraft(String(saved))
  }

  const commit = () => {
    const months = draft.trim() === '' ? NaN : Number(draft)
    if (Number.isInteger(months) && months >= 0 && months <= MAX_MONTHS) {
      if (months !== saved) void onChange({ cashReserveMonths: months })
      setDraft(String(months))
    } else {
      setDraft(String(saved))
    }
  }

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
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
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
