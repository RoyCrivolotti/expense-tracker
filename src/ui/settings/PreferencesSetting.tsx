import type { ExpenseSettings } from '../../types'
import { formatCents, resolveMoneyFormat } from '../../engine'
import { Card, SectionTitle } from '../components/primitives'
import { CURRENCIES, NUMBER_STYLES } from './moneyOptions'
import styles from '../tabs/tabs.module.css'

interface Props {
  settings: ExpenseSettings
  onChange: (patch: Partial<ExpenseSettings>) => void
}

/** Owner-wide currency, number format, and budget-month start day. */
export function PreferencesSetting({ settings, onChange }: Props) {
  const format = resolveMoneyFormat(settings.currencyCode, settings.numberLocale)
  const preview = formatCents(1234567, format)

  return (
    <>
      <SectionTitle>Money &amp; months</SectionTitle>
      <Card>
        <label className={styles.defaultAccountField}>
          <span className={styles.defaultAccountLabel}>Currency</span>
          <select
            className={styles.defaultAccountSelect}
            value={settings.currencyCode}
            onChange={(e) => onChange({ currencyCode: e.target.value })}
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.defaultAccountField}>
          <span className={styles.defaultAccountLabel}>Number format</span>
          <select
            className={styles.defaultAccountSelect}
            value={settings.numberLocale}
            onChange={(e) => onChange({ numberLocale: e.target.value })}
          >
            {NUMBER_STYLES.map((n) => (
              <option key={n.locale} value={n.locale}>
                {n.label}
              </option>
            ))}
          </select>
        </label>

        <div className={styles.defRow}>
          <span>Preview</span>
          <span>{preview}</span>
        </div>
        <p className={styles.settingHint}>
          Display only: changes the symbol and decimal separator shown for every transaction, past
          and future. Amounts are not converted or recalculated — there is no currency exchange, so
          only pick a currency you actually track everything in.
        </p>

        <label className={styles.defaultAccountField}>
          <span className={styles.defaultAccountLabel}>Budget month starts on day</span>
          <input
            className={styles.defaultAccountSelect}
            type="number"
            min={1}
            max={28}
            value={settings.budgetRolloverDay}
            onChange={(e) => {
              const day = Number(e.target.value)
              if (Number.isInteger(day) && day >= 1 && day <= 28) onChange({ budgetRolloverDay: day })
            }}
          />
        </label>
        <p className={styles.settingHint}>
          Day of the month new spending starts counting toward the next budget month. Set to 1 for
          plain calendar months. Only affects transactions added from now on.
        </p>
      </Card>
    </>
  )
}
