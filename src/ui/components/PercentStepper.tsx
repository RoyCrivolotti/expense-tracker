import { useCallback } from 'react'
import { formatPercent, parsePercentToFraction, type MoneyFormat } from '../../engine'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import styles from './PercentStepper.module.css'

const STEP = 0.005

function draftFromFraction(fraction: number, format: MoneyFormat): string {
  return (fraction * 100).toFixed(1).replace('.', format.decimalSeparator)
}

interface PercentStepperProps {
  value: number
  onChange?: ((fraction: number) => void) | undefined
  min?: number
  max?: number
  disabled?: boolean
}

export function PercentStepper({
  value,
  onChange,
  min = 0,
  max = 0.2,
  disabled = false,
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
        aria-label="Decrease percentage"
        onClick={() => commit(value - STEP)}
      >
        −
      </button>
      <input
        key={value}
        className={styles.input}
        type="text"
        inputMode="decimal"
        aria-label="Annual return percentage"
        defaultValue={draftFromFraction(value, format)}
        onBlur={(e) => commit(parsePercentToFraction(e.target.value, format))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit(parsePercentToFraction(e.currentTarget.value, format))
        }}
      />
      <button
        type="button"
        className={styles.btn}
        aria-label="Increase percentage"
        onClick={() => commit(value + STEP)}
      >
        +
      </button>
    </div>
  )
}
