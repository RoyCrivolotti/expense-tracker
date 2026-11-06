import { useState } from 'react'
import type { ExpenseSettings } from '../../types'
import { formatCents, resolveMoneyFormat } from '../../engine'
import { DayOfMonthInput } from '../components/DayOfMonthInput'
import { Card, SectionTitle } from '../components/primitives'
import { CURRENCIES, CURRENCY_DISPLAY_ONLY_HINT, NUMBER_STYLES } from './moneyOptions'
import styles from '../tabs/tabs.module.css'

interface Props {
  settings: ExpenseSettings
  onChange: (patch: Partial<ExpenseSettings>) => void | Promise<void>
}

/** Owner-wide currency, number format, and budget-month start day. */
export function PreferencesSetting({ settings, onChange }: Props) {
  const format = resolveMoneyFormat(settings.currencyCode, settings.numberLocale)
  const preview = formatCents(1234567, format)

  return (
    <>
      <SectionTitle>Money &amp; months</SectionTitle>
      <Card>
        <div className={styles.settingGroup}>
          <label className={styles.defaultAccountField}>
            <span className={styles.defaultAccountLabel}>Currency</span>
            <select
              className={styles.defaultAccountSelect}
              value={settings.currencyCode}
              onChange={(e) => void onChange({ currencyCode: e.target.value })}
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
              onChange={(e) => void onChange({ numberLocale: e.target.value })}
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
          <p className={styles.settingHint}>{CURRENCY_DISPLAY_ONLY_HINT}</p>
        </div>

        <div className={`${styles.settingGroup} ${styles.settingGroupDivider}`}>
          <RolloverDayField settings={settings} onChange={onChange} />
          <p className={styles.settingHint}>
            Day of the month new spending starts counting toward the next budget month. Set to 1
            for plain calendar months. Only affects transactions added from now on.
          </p>
        </div>
      </Card>
    </>
  )
}

function RolloverDayField({ settings, onChange }: Props) {
  // The day just picked, shown until the save comes back. Bound straight to
  // `settings` the field kept the old day on screen for the whole round trip,
  // which read as the tap not having registered.
  const [pendingDay, setPendingDay] = useState<number | null>(null)
  const rolloverDay = pendingDay ?? settings.budgetRolloverDay
  const chooseRolloverDay = (day: number) => {
    if (day === rolloverDay) return
    setPendingDay(day)
    // Cleared whether the save worked or not: on failure the field falls back to the saved day.
    // A later pick keeps its own pending value when an earlier save finishes after it.
    void Promise.resolve(onChange({ budgetRolloverDay: day })).finally(() =>
      setPendingDay((current) => (current === day ? null : current)),
    )
  }

  return (
    <div className={styles.defaultAccountField}>
      <span className={styles.defaultAccountLabel}>Budget month starts on day</span>
      <DayOfMonthInput value={rolloverDay} ariaLabel="Budget month starts on day" onChange={chooseRolloverDay} />
    </div>
  )
}
