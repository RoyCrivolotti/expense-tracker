import { useCallback } from 'react'
import { formatMoneyInput, parseMoneyToCents } from '../../../engine'
import { DateInput } from '../../components/DateInput'
import { PercentStepper } from '../../components/PercentStepper'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import styles from './goals.module.css'
import stepperStyles from '../../components/PercentStepper.module.css'

interface MoneyFieldProps {
  label: string
  value: number
  onChange: (cents: number) => void
}

/**
 * A money amount typed in full. There is no slider and no ceiling: a starting balance or a
 * house price is a fact the user knows, not a dial to explore, and any cap would be wrong for
 * somebody.
 */
export function MoneyField({ label, value, onChange }: MoneyFieldProps) {
  const format = useMoneyFormat()
  const commit = useCallback(
    (raw: string) => onChange(Math.max(0, parseMoneyToCents(raw, format))),
    [format, onChange],
  )

  return (
    <label className={styles.field}>
      <div className={styles.fieldRow}>
        <span className={styles.fieldLabel}>{label}</span>
        <input
          key={value}
          className={styles.valueInput}
          type="text"
          inputMode="decimal"
          aria-label={label}
          defaultValue={formatMoneyInput(value, format)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit(e.currentTarget.value)
          }}
        />
      </div>
    </label>
  )
}

interface NumberFieldProps {
  label: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}

/** A whole number with a −/+ stepper, the same shape as the percent stepper. */
export function NumberField({ label, value, min, max, onChange }: NumberFieldProps) {
  const commit = useCallback(
    (next: number) => {
      if (Number.isNaN(next)) return
      onChange(Math.min(max, Math.max(min, Math.round(next))))
    },
    [max, min, onChange],
  )

  return (
    <div className={styles.field}>
      <div className={styles.fieldRow}>
        <span className={styles.fieldLabel}>{label}</span>
        <div className={stepperStyles.wrap}>
          <button
            type="button"
            className={stepperStyles.btn}
            aria-label={`Decrease ${label}`}
            disabled={value <= min}
            onClick={() => commit(value - 1)}
          >
            −
          </button>
          <input
            key={value}
            className={stepperStyles.input}
            type="text"
            inputMode="numeric"
            aria-label={label}
            defaultValue={String(value)}
            onBlur={(e) => commit(Number(e.target.value.replace(',', '.')))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit(Number(e.currentTarget.value.replace(',', '.')))
            }}
          />
          <button
            type="button"
            className={stepperStyles.btn}
            aria-label={`Increase ${label}`}
            disabled={value >= max}
            onClick={() => commit(value + 1)}
          >
            +
          </button>
        </div>
      </div>
    </div>
  )
}

interface PercentFieldProps {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  onChange: (v: number) => void
  showSlider?: boolean
}

export function PercentField({
  label,
  value,
  min = 0,
  max = 0.2,
  step = 0.001,
  onChange,
  showSlider = true,
}: PercentFieldProps) {
  return (
    <div className={styles.field}>
      <div className={styles.fieldRow}>
        <span className={styles.fieldLabel}>{label}</span>
        <PercentStepper value={value} min={min} max={max} onChange={onChange} />
      </div>
      {showSlider ? (
        <input
          className={styles.range}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={label}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      ) : null}
    </div>
  )
}

interface DateFieldProps {
  label: string
  value: string | null
  hint?: string
  onChange: (v: string | null) => void
}

export function DateField({ label, value, hint, onChange }: DateFieldProps) {
  return (
    <div className={styles.field}>
      <div className={styles.fieldRow}>
        <span className={styles.fieldLabel}>{label}</span>
        <DateInput
          value={value ?? ''}
          ariaLabel={label}
          onChange={(v) => onChange(v || null)}
        />
      </div>
      {hint ? <p className={styles.fieldHint}>{hint}</p> : null}
    </div>
  )
}

interface PurchaseYearFieldProps {
  value: number | null
  maxYear: number
  onChange: (v: number | null) => void
}

export function PurchaseYearField({ value, maxYear, onChange }: PurchaseYearFieldProps) {
  const raw = value ?? -1
  const label =
    raw < 0 ? 'Never' : raw === 0 ? 'Now' : `Year ${raw}`

  return (
    <label className={styles.field}>
      <div className={styles.fieldRow}>
        <span className={styles.fieldLabel}>Purchase year</span>
        <span className={styles.fieldValue}>{label}</span>
      </div>
      <input
        className={styles.range}
        type="range"
        min={-1}
        max={maxYear}
        step={1}
        value={raw}
        onChange={(e) => {
          const v = Number(e.target.value)
          onChange(v < 0 ? null : v)
        }}
      />
    </label>
  )
}
