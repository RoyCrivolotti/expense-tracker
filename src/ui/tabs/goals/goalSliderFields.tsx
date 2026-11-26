import { formatPercent } from '../../../engine'
import { PercentStepper } from '../../components/PercentStepper'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import { purchaseYearLabel } from './leverFields'
import styles from './goals.module.css'

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
  const format = useMoneyFormat()
  return (
    <div className={styles.field}>
      <div className={`${styles.fieldRow} ${styles.fieldRowStepper}`}>
        <span className={styles.fieldLabel}>{label}</span>
        <PercentStepper value={value} min={min} max={max} onChange={onChange} ariaLabel={label} />
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
          aria-valuetext={formatPercent(value, format)}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      ) : null}
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
  const label = purchaseYearLabel(value, maxYear)
  // A purchase year past the horizon (the horizon was shortened after it was set) stays on the
  // track, where it would otherwise be clamped to the end while the label still named the year.
  const max = Math.max(maxYear, raw)

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
        max={max}
        step={1}
        value={raw}
        aria-label="Purchase year"
        aria-valuetext={label}
        onChange={(e) => {
          const v = Number(e.target.value)
          onChange(v < 0 ? null : v)
        }}
      />
    </label>
  )
}
