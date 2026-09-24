import { useRef, useState } from 'react'
import type { ExpenseSettings } from '../../types'
import { Card } from '../components/primitives'
import { failureMessage } from '../hooks/useFailureToast'
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
 * Escape puts the saved value back. A save that fails puts it back too, and says so beside
 * the field, since a field still showing what was typed reads as saved.
 */
export function CashReserveSetting({ settings, onChange }: Props) {
  const saved = settings.cashReserveMonths
  const [draft, setDraft] = useState(String(saved))
  const [error, setError] = useState<string | null>(null)
  // Escape blurs the field to leave it, and that blur must not save what was typed.
  const cancelled = useRef(false)
  // A save landing from elsewhere replaces the draft; tracked in render rather than in
  // an effect so the field never shows the old value for a frame.
  const [seen, setSeen] = useState(saved)
  if (seen !== saved) {
    setSeen(saved)
    setDraft(String(saved))
  }

  const commit = async () => {
    if (cancelled.current) {
      cancelled.current = false
      return
    }
    const months = draft.trim() === '' ? NaN : Number(draft)
    if (!Number.isInteger(months) || months < 0 || months > MAX_MONTHS) {
      setDraft(String(saved))
      return
    }
    setDraft(String(months))
    if (months === saved) return
    try {
      await onChange({ cashReserveMonths: months })
      setError(null)
    } catch (e) {
      setDraft(String(saved))
      setError(failureMessage(e))
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
            onChange={(e) => {
              setDraft(e.target.value)
              setError(null)
            }}
            onBlur={() => void commit()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') {
                cancelled.current = true
                setDraft(String(saved))
                setError(null)
                e.currentTarget.blur()
              }
            }}
          />
        </label>
        {error ? (
          <p className={styles.settingError} role="alert">
            {error}
          </p>
        ) : null}
        <p className={styles.settingHint}>
          Progress sets the cash accounts in your latest check-in against your average monthly
          spending and says how many months they cover. With a target it says whether you are
          there yet; 0 leaves the target off.
        </p>
      </div>
    </Card>
  )
}
