import { formatCents, fullMonthLabel, parseMoneyToCents } from '../../engine'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import { moneyAlways } from './cells'
import styles from './analytics.module.css'

type OnSave = ((yearMonth: string, actualCashCents: number | null) => Promise<void>) | undefined

/** Editable real-cash input; renders read-only text when onSave is undefined. */
export function ActualCashCell({
  month,
  valueCents,
  onSave,
}: {
  month: string
  valueCents: number | null
  onSave: OnSave
}) {
  const format = useMoneyFormat()
  if (!onSave) return <>{valueCents === null ? '—' : moneyAlways(valueCents, format)}</>

  const commit = (raw: string) => {
    const trimmed = raw.trim()
    if (trimmed === '') {
      if (valueCents !== null) void onSave(month, null)
      return
    }
    const cents = parseMoneyToCents(trimmed, format)
    if (cents !== valueCents) void onSave(month, cents)
  }
  return (
    <input
      key={valueCents ?? 'empty'}
      className={styles.cashInput}
      inputMode="decimal"
      placeholder="—"
      aria-label={`Actual cash for ${fullMonthLabel(month)}`}
      defaultValue={valueCents === null ? '' : formatCents(valueCents, format, false)}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
    />
  )
}
