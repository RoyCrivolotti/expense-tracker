import { useCallback, useState } from 'react'
import type { NewGoalScenario } from '../../../../data/dataSource'
import { formatMoneyInput, formatPercent, formatPercentInput, parseMoneyToCents } from '../../../../engine'
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
  /** The value as the field writes it. The field shows this whenever it is not being typed in. */
  text: string
  unit: string
  /** The unit comes before the digits, as a dollar sign does, instead of after them. */
  unitFirst?: boolean
  /** Called on blur and on Enter, with what was typed, and only if something was. */
  onCommit: (raw: string) => void
  inputMode: 'decimal' | 'numeric'
}

/**
 * The lever's big number: a field that reads as text until it is hovered or focused.
 *
 * What is typed is kept apart from the value. A field that was only tabbed through has typed
 * nothing, so it commits nothing: committing its text would write the value back as the field
 * shows it, and a percentage shown to one decimal would lose the second one it was given. After
 * a commit the field reads the value again, so input that was refused or clamped does not stay in it.
 */
function TypedValue({ label, text, unit, unitFirst = false, onCommit, inputMode }: TypedProps) {
  const [typed, setTyped] = useState<string | null>(null)
  const shown = typed ?? text
  const commit = () => {
    if (typed === null) return
    setTyped(null)
    onCommit(typed)
  }
  const unitText = <span className={styles.leverUnit}>{unit}</span>
  return (
    // A label, so a tap or a click anywhere on the figure's row (not only on its digits) puts the
    // cursor in the field. The input names itself, so the unit inside does not add to the name.
    <label className={styles.leverValue}>
      {unitFirst ? unitText : null}
      <input
        className={unitFirst ? `${styles.leverInput} ${styles.leverInputAfterUnit}` : styles.leverInput}
        type="text"
        inputMode={inputMode}
        aria-label={label}
        value={shown}
        style={{ width: `${Math.max(2, shown.length) + 0.5}ch` }}
        onChange={(e) => setTyped(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
        }}
      />
      {unitFirst ? null : unitText}
    </label>
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * What was typed as a plain number, or null when it is not one. A comma or a point both mean
 * the decimal mark (a percentage or a year count has no thousands), and nothing typed is not zero.
 */
function typedNumber(raw: string): number | null {
  const cleaned = raw.replace(/[%\s]/g, '').replace(',', '.')
  if (cleaned === '') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
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
  // A value that is already there is not an edit: it would make a new draft, and redraw the
  // charts, for nothing.
  const patch = useCallback(
    (next: number | null) => {
      if (next !== value) onChange({ [key]: next })
    },
    [key, onChange, value],
  )

  let body
  if (kind === 'money') {
    const cents = value as number
    body = (
      <>
        <TypedValue
          label={label}
          text={moneyText(cents, format)}
          unit={format.symbol}
          unitFirst={format.symbolPosition === 'prefix'}
          inputMode="decimal"
          onCommit={(raw) => {
            if (/\d/.test(raw)) patch(Math.max(0, parseMoneyToCents(raw, format)))
          }}
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
          unit={years === 1 ? 'yr' : 'yrs'}
          inputMode="numeric"
          onCommit={(raw) => {
            const n = typedNumber(raw)
            if (n !== null) patch(clamp(Math.round(n), min, max))
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
          onCommit={(raw) => {
            const n = typedNumber(raw)
            if (n !== null) patch(clamp(n / 100, min, max))
          }}
        />
        <div className={styles.leverTrack}>
          <input
            className={goalStyles.range}
            type="range"
            min={min}
            max={max}
            step={0.001}
            value={fraction}
            aria-label={label}
            aria-valuetext={formatPercent(fraction, format)}
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
            max={Math.max(draft.horizonYears, year ?? 0)}
            step={1}
            value={year ?? -1}
            aria-label={label}
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
