import { useCallback } from 'react'
import type { NewGoalScenario } from '../../../../data/dataSource'
import { formatMoneyInput, formatPercentInput, parseMoneyToCents, parsePercentToFraction } from '../../../../engine'
import type { MoneyFormat } from '../../../../engine'
import { useMoneyFormat } from '../../../hooks/moneyFormatContext'
import type { LeverSpec } from '../leverFields'
import goalStyles from '../goals.module.css'
import { StarButton } from './StarButton'
import styles from './planDesktop.module.css'

interface LeverProps {
  spec: LeverSpec
  draft: NewGoalScenario
  onChange: (patch: Partial<NewGoalScenario>) => void
  /** Takes the input out of the bar; absent where the bar cannot be changed. */
  onUnstar?: (() => void) | undefined
}

/** Whole amounts without the cents, so a seven-figure balance fits a bar column. */
function moneyText(cents: number, format: MoneyFormat): string {
  return cents % 100 === 0 ? Math.round(cents / 100).toLocaleString(format.locale) : formatMoneyInput(cents, format)
}

function purchaseYearText(year: number | null): string {
  return year === null ? 'Never' : year === 0 ? 'Now' : `Year ${year}`
}

interface TypedProps {
  label: string
  text: string
  unit: string
  /** Committed on blur and on Enter, with what was typed. */
  onCommit: (raw: string) => void
  inputMode: 'decimal' | 'numeric'
  /** Changes when the value does by other means (a slider, Discard), which remounts the field. */
  valueKey: number
}

/** The lever's big number: a field that reads as text until it is hovered or focused. */
function TypedValue({ label, text, unit, onCommit, inputMode, valueKey }: TypedProps) {
  return (
    <div className={styles.leverValue}>
      <input
        key={valueKey}
        className={styles.leverInput}
        type="text"
        inputMode={inputMode}
        aria-label={label}
        defaultValue={text}
        style={{ width: `${Math.max(2, text.length) + 0.5}ch` }}
        onBlur={(e) => onCommit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onCommit(e.currentTarget.value)
        }}
      />
      <span className={styles.leverUnit}>{unit}</span>
    </div>
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * One input in the levers bar: its name, its value as a big number to type over, and a slider
 * where the input has one in the panel (the percentages and the purchase year). Money and years
 * stay typed: a balance or a house price is a fact, not a dial.
 */
export function Lever({ spec, draft, onChange, onUnstar }: LeverProps) {
  const format = useMoneyFormat()
  const { key, kind, label, short } = spec
  const value = draft[key]
  const patch = useCallback((next: number | null) => onChange({ [key]: next }), [key, onChange])

  let body
  if (kind === 'money') {
    const cents = value as number
    body = (
      <>
        <TypedValue
          label={label}
          text={moneyText(cents, format)}
          unit={format.symbol}
          inputMode="decimal"
          valueKey={cents}
          onCommit={(raw) => patch(Math.max(0, parseMoneyToCents(raw, format)))}
        />
        <div className={styles.leverTrack} aria-hidden />
      </>
    )
  } else if (kind === 'years') {
    const years = value as number
    const [min, max] = [spec.min ?? 1, spec.max ?? 60]
    body = (
      <>
        <TypedValue
          label={label}
          text={String(years)}
          unit="yrs"
          inputMode="numeric"
          valueKey={years}
          onCommit={(raw) => {
            const n = Number(raw.replace(',', '.'))
            if (!Number.isNaN(n)) patch(clamp(Math.round(n), min, max))
          }}
        />
        <div className={styles.leverTrack} aria-hidden />
      </>
    )
  } else if (kind === 'percent') {
    const fraction = value as number
    const [min, max] = [spec.min ?? 0, spec.max ?? 0.2]
    body = (
      <>
        <TypedValue
          label={label}
          text={formatPercentInput(fraction, format)}
          unit="%"
          inputMode="decimal"
          valueKey={fraction}
          onCommit={(raw) => patch(clamp(parsePercentToFraction(raw, format), min, max))}
        />
        <div className={styles.leverTrack}>
          <input
            className={goalStyles.range}
            type="range"
            min={min}
            max={max}
            step={0.001}
            value={fraction}
            aria-label={`${label} slider`}
            onChange={(e) => patch(Number(e.target.value))}
          />
        </div>
      </>
    )
  } else {
    const year = value
    body = (
      <>
        <div className={styles.leverValue}>
          <span className={styles.leverText}>{purchaseYearText(year)}</span>
        </div>
        <div className={styles.leverTrack}>
          <input
            className={goalStyles.range}
            type="range"
            min={-1}
            max={draft.horizonYears}
            step={1}
            value={year ?? -1}
            aria-label={`${label} slider`}
            aria-valuetext={purchaseYearText(year)}
            onChange={(e) => {
              const v = Number(e.target.value)
              patch(v < 0 ? null : v)
            }}
          />
        </div>
      </>
    )
  }

  return (
    <div className={styles.lever}>
      <div className={styles.leverHead}>
        <span className={styles.leverLabel} title={short}>{short}</span>
        {onUnstar ? <StarButton filled label={`Remove ${short} from the bar`} onClick={onUnstar} /> : null}
      </div>
      {body}
    </div>
  )
}
