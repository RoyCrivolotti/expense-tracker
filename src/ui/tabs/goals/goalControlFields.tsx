import { useCallback } from 'react'
import { parseEuroToCents } from '../../../engine'
import { PercentStepper } from '../../components/PercentStepper'
import styles from './goals.module.css'

function centsDraft(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',')
}

interface MoneyFieldProps {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  onChange: (cents: number) => void
  showSlider?: boolean
}

export function MoneyField({
  label,
  value,
  min = 0,
  max = 100_000_000,
  step = 10_000,
  onChange,
  showSlider = true,
}: MoneyFieldProps) {
  const commit = useCallback(
    (next: number) => onChange(Math.min(max, Math.max(min, next))),
    [max, min, onChange],
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
          defaultValue={centsDraft(value)}
          onBlur={(e) => commit(parseEuroToCents(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit(parseEuroToCents(e.currentTarget.value))
          }}
        />
      </div>
      {showSlider ? (
        <input
          className={styles.range}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => commit(Number(e.target.value))}
        />
      ) : null}
    </label>
  )
}

interface NumberFieldProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  format?: (v: number) => string
  onChange: (v: number) => void
  showSlider?: boolean
}

export function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  format = String,
  onChange,
  showSlider = true,
}: NumberFieldProps) {
  const commit = useCallback(
    (raw: string) => {
      const n = Number(raw.replace(',', '.'))
      if (Number.isNaN(n)) return
      onChange(Math.min(max, Math.max(min, Math.round(n))))
    },
    [max, min, onChange],
  )

  return (
    <label className={styles.field}>
      <div className={styles.fieldRow}>
        <span className={styles.fieldLabel}>{label}</span>
        <input
          key={value}
          className={styles.valueInput}
          type="text"
          inputMode="numeric"
          aria-label={label}
          defaultValue={format(value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit(e.currentTarget.value)
          }}
        />
      </div>
      {showSlider ? (
        <input
          className={styles.range}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      ) : null}
    </label>
  )
}

interface PercentFieldProps {
  label: string
  value: number
  min?: number
  max?: number
  onChange: (v: number) => void
}

export function PercentField({ label, value, min = 0, max = 0.2, onChange }: PercentFieldProps) {
  return (
    <div className={styles.field}>
      <div className={styles.fieldRow}>
        <span className={styles.fieldLabel}>{label}</span>
        <PercentStepper value={value} min={min} max={max} onChange={onChange} />
      </div>
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
