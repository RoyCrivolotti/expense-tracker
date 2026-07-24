import { formatCents, resolveMoneyFormat } from '../../engine'
import { CURRENCIES, CURRENCY_DISPLAY_ONLY_HINT, NUMBER_STYLES } from '../settings/moneyOptions'
import styles from './OnboardingWizard.module.css'

export interface MoneyDraft {
  currencyCode: string
  numberLocale: string
  budgetRolloverDay: number
}

export function OnboardingMoneyStep({
  money,
  onChange,
}: {
  money: MoneyDraft
  onChange: (patch: Partial<MoneyDraft>) => void
}) {
  const format = resolveMoneyFormat(money.currencyCode, money.numberLocale)
  const preview = formatCents(1234567, format)

  return (
    <div className={styles.stepBody}>
      <p className={styles.lead}>
        How should money look, and when does your budget month start? You can change all of this
        later in Settings.
      </p>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>Currency</span>
        <select
          value={money.currencyCode}
          onChange={(e) => onChange({ currencyCode: e.target.value })}
        >
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>Number format</span>
        <select
          value={money.numberLocale}
          onChange={(e) => onChange({ numberLocale: e.target.value })}
        >
          {NUMBER_STYLES.map((n) => (
            <option key={n.locale} value={n.locale}>
              {n.label}
            </option>
          ))}
        </select>
      </label>

      <div className={styles.preview}>
        <span>Preview</span>
        <strong>{preview}</strong>
      </div>
      <p className={styles.hint}>{CURRENCY_DISPLAY_ONLY_HINT}</p>

      <label className={`${styles.field} ${styles.fieldGroupDivider}`}>
        <span className={styles.fieldLabel}>Budget month starts on day</span>
        <input
          type="number"
          min={1}
          max={28}
          value={money.budgetRolloverDay}
          onChange={(e) => {
            const day = Number(e.target.value)
            if (Number.isInteger(day) && day >= 1 && day <= 28) onChange({ budgetRolloverDay: day })
          }}
        />
      </label>
      <p className={styles.hint}>
        Day of the month new spending starts counting toward the next budget month. Leave at 1 for
        plain calendar months.
      </p>
    </div>
  )
}
