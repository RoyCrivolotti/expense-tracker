import { useState } from 'react'
import { formatCents, resolveMoneyFormat } from '../../engine'
import { CURRENCIES, CURRENCY_DISPLAY_ONLY_HINT, NUMBER_STYLES } from '../settings/moneyOptions'
import styles from './OnboardingWizard.module.css'

export interface MoneyDraft {
  currencyCode: string
  numberLocale: string
  budgetRolloverDay: number
}

/** What amounts will look like, with the number format kept behind "Change": almost nobody needs it. */
function NumberFormatPreview({
  money,
  onChange,
}: {
  money: MoneyDraft
  onChange: (patch: Partial<MoneyDraft>) => void
}) {
  const [changing, setChanging] = useState(false)
  const preview = formatCents(123456, resolveMoneyFormat(money.currencyCode, money.numberLocale))
  return (
    <>
      <div className={styles.preview}>
        <span>Amounts will look like</span>
        <strong>{preview}</strong>
        {changing ? null : (
          <button type="button" className={styles.changeLink} onClick={() => setChanging(true)}>
            Change
          </button>
        )}
      </div>
      {changing ? (
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Number format</span>
          <select value={money.numberLocale} onChange={(e) => onChange({ numberLocale: e.target.value })}>
            {NUMBER_STYLES.map((n) => (
              <option key={n.locale} value={n.locale}>
                {n.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </>
  )
}

export function OnboardingMoneyStep({
  firstRun,
  money,
  onChange,
}: {
  firstRun: boolean
  money: MoneyDraft
  onChange: (patch: Partial<MoneyDraft>) => void
}) {
  return (
    <div className={styles.stepBody}>
      <p className={styles.lead}>
        {firstRun
          ? 'This is your own ledger. Nobody else who uses the app can see it. Three short choices, then you add your first payment.'
          : 'Change your currency or when your month starts. You can change all of this later in Settings.'}
      </p>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>Currency</span>
        <select value={money.currencyCode} onChange={(e) => onChange({ currencyCode: e.target.value })}>
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <p className={styles.hint}>{CURRENCY_DISPLAY_ONLY_HINT}</p>

      <NumberFormatPreview money={money} onChange={onChange} />

      <label className={`${styles.field} ${styles.fieldGroupDivider}`}>
        <span className={styles.fieldLabel}>My month starts on day</span>
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
        Leave 1 for calendar months. Pick your payday if you budget from one pay to the next.
      </p>
    </div>
  )
}
