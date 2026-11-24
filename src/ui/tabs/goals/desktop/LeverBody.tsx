import type { NewGoalScenario } from '../../../../data/dataSource'
import { formatPercent, formatPercentInput, tryParseMoneyToCents } from '../../../../engine'
import type { MoneyFormat } from '../../../../engine'
import { useMoneyFormat } from '../../../hooks/moneyFormatContext'
import { firstChangeNote } from '../contributionText'
import { purchaseYearLabel, type LeverSpec } from '../leverFields'
import goalStyles from '../goals.module.css'
import { clamp, moneyText, toFraction, typedNumber } from './leverValues'
import { TypedValue } from './TypedValue'
import styles from './planDesktop.module.css'

/** What each kind of lever draws under its name: the spec, the scenario, and the patch that skips an unchanged value. */
interface BodyProps {
  spec: LeverSpec
  draft: NewGoalScenario
  value: NewGoalScenario[LeverSpec['key']]
  patch: (next: number | null) => void
  format: MoneyFormat
}

/**
 * The row under a money input: empty, so the figures line up with the levers that have a slider
 * there. The monthly amount is what the scenario starts with, and the changes after it are not a
 * dial here, so on that one the row says they are there.
 */
function MoneyTrack({ leverKey, draft }: { leverKey: keyof NewGoalScenario; draft: NewGoalScenario }) {
  const format = useMoneyFormat()
  const note = leverKey === 'monthlyContributionCents' ? firstChangeNote(draft, format) : null
  if (!note) return <div className={styles.leverTrack} aria-hidden />
  return (
    <div className={styles.leverTrack}>
      <span className={styles.leverNote} title={note}>
        {note}
      </span>
    </div>
  )
}

/** A balance or a price: typed, with the row under it. */
function MoneyBody({ spec, draft, value, patch, format }: BodyProps) {
  const cents = value as number
  const { key, label } = spec
  return (
    <>
      <TypedValue
        label={label}
        text={moneyText(cents, format)}
        unit={format.symbol}
        unitFirst={format.symbolPosition === 'prefix'}
        inputMode="decimal"
        onCommit={(raw) => {
          const cents = tryParseMoneyToCents(raw, format)
          if (cents !== null) patch(Math.max(0, cents))
        }}
      />
      <MoneyTrack leverKey={key} draft={draft} />
    </>
  )
}

/** A count of years: typed, clamped to its bounds. */
function YearsBody({ spec, value, patch }: BodyProps) {
  const years = value as number
  const [min, max] = [spec.min ?? 1, spec.max ?? 60]
  const { label } = spec
  return (
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
}

/** A rate: typed, or moved on its slider. */
function PercentBody({ spec, value, patch, format }: BodyProps) {
  const fraction = value as number
  const [min, max] = [spec.min ?? 0, spec.max ?? 0.2]
  const { label } = spec
  return (
    <>
      <TypedValue
        label={label}
        text={formatPercentInput(fraction, format)}
        unit="%"
        inputMode="decimal"
        onCommit={(raw) => {
          const n = typedNumber(raw)
          if (n !== null) patch(clamp(toFraction(n), min, max))
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
}

/** The purchase year: read as words, moved on its slider, Never at its left end. */
function PurchaseYearBody({ spec, draft, value, patch }: BodyProps) {
  const year = value
  const { label } = spec
  return (
    <>
      <div className={styles.leverValue}>
        <span className={styles.leverText}>{purchaseYearLabel(year, draft.horizonYears)}</span>
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
          aria-valuetext={purchaseYearLabel(year, draft.horizonYears)}
          onChange={(e) => {
            const v = Number(e.target.value)
            patch(v < 0 ? null : v)
          }}
        />
      </div>
    </>
  )
}

/** The lever under its name, by the kind of input it is. */
export function LeverBody(props: BodyProps) {
  if (props.spec.kind === 'money') return <MoneyBody {...props} />
  if (props.spec.kind === 'years') return <YearsBody {...props} />
  if (props.spec.kind === 'percent') return <PercentBody {...props} />
  return <PurchaseYearBody {...props} />
}
