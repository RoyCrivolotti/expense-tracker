import { useCallback } from 'react'
import { formatPercent, formatPercentInput, tryParsePercentToFraction } from '../../engine'
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
    (next: number): number => {
      const clamped = Math.min(max, Math.max(min, next))
      onChange?.(clamped)
      return clamped
    },
    [max, min, onChange],
  )

  // Nothing typed, or text that is not a number ("about 4"), is not 0%: the box goes back to the value it had.
  // Text that is what the box showed is not an edit: the box shows one place, so a value with more (a
  // share a re-baseline worked out) would be rounded, and clamped, by tabbing through it.
  const commitText = (input: HTMLInputElement) => {
    const shown = formatPercentInput(value, format)
    if (input.value === shown) return
    const typed = tryParsePercentToFraction(input.value)
    if (typed === null) {
      input.value = shown
      return
    }
    // Shows what it was held to, which is not re-rendered when it is what the field already had.
    input.value = formatPercentInput(commit(typed), format)
  }

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
        onBlur={(e) => commitText(e.target)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commitText(e.currentTarget)
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
