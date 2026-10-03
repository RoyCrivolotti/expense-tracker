import { useCallback } from 'react'
import { formatPercent, formatPercentInput, parsePercentToFraction } from '../../engine'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import styles from './PercentStepper.module.css'

const STEP = 0.005

interface PercentStepperProps {
  value: number
  onChange?: ((fraction: number) => void) | undefined
  min?: number
  max?: number
  disabled?: boolean
  /** What the field is called. The buttons are named from it, so two steppers on a page are never alike. */
  ariaLabel: string
}

export function PercentStepper({
  value,
  onChange,
  min = 0,
  max = 0.2,
  disabled = false,
  ariaLabel,
}: PercentStepperProps) {
  const format = useMoneyFormat()
  const readOnly = disabled || onChange == null

  const commit = useCallback(
    (next: number) => {
      const clamped = Math.min(max, Math.max(min, next))
      onChange?.(clamped)
    },
    [max, min, onChange],
  )

  if (readOnly) {
    return <span className={styles.static}>{formatPercent(value, format)}</span>
  }

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.btn}
        aria-label={`Decrease ${ariaLabel}`}
        onClick={() => commit(value - STEP)}
      >
        −
      </button>
      <input
        key={value}
        className={styles.input}
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        defaultValue={formatPercentInput(value, format)}
        onBlur={(e) => commit(parsePercentToFraction(e.target.value, format))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit(parsePercentToFraction(e.currentTarget.value, format))
        }}
      />
      <button
        type="button"
        className={styles.btn}
        aria-label={`Increase ${ariaLabel}`}
        onClick={() => commit(value + STEP)}
      >
        +
      </button>
    </div>
  )
}
