import { Fragment, type ReactNode } from 'react'
import type { NewGoalScenario } from '../../../data/dataSource'
import { dateAtYears, formatCentsCompact, formatMoneyInput, tryParseMoneyToCents } from '../../../engine'
import { DateInput } from '../../components/DateInput'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import { scenarioInk } from './scenarioInk'
import type { StartLaterView } from './startLaterModel'
import goalStyles from './goals.module.css'
import styles from './StartLaterSheet.module.css'

/**
 * A sentence with the scenario's name set apart: bold, after a dot in its colour, as its row in the table has
 * it. A long name ("Path B: buy in year 5") otherwise runs into the words after it. The colour is on the dot,
 * not the letters: half the palette is too pale for small text even as the chart's ink.
 */
function Named({ text, source }: { text: string; source: NewGoalScenario }): ReactNode {
  const { name, color } = source
  if (!name) return text
  const parts = text.split(name)
  return parts.map((part, i) => (
    <Fragment key={i}>
      {i > 0 ? (
        <span className={styles.name}>
          <span className={styles.dot} style={{ background: scenarioInk(color) }} aria-hidden />
          {name}
        </span>
      ) : null}
      {part}
    </Fragment>
  ))
}

/**
 * The starting balance as typed. It is read when the box is left (or on Enter), as the editor's money fields
 * are, so a half-typed figure never moves the suggestion's lines under the person's cursor.
 */
export function BalanceField({
  view,
  source,
  onTyped,
}: {
  view: StartLaterView
  source: NewGoalScenario
  onTyped: (cents: number | null) => void
}) {
  const format = useMoneyFormat()
  const named = (text: string) => <Named text={text} source={source} />
  const commit = (input: HTMLInputElement) => {
    const cents = tryParseMoneyToCents(input.value, format)
    const next = cents === null ? null : Math.max(0, cents)
    // Leaving the box, or Enter, with the figure it was showing is not typing one: the suggestion keeps following the date.
    if (next === null || next === view.balanceCents) input.value = formatMoneyInput(view.balanceCents, format)
    else onTyped(next)
  }
  return (
    <div className={goalStyles.field}>
      <label className={goalStyles.fieldRow}>
        <span className={goalStyles.fieldLabel}>Starting balance</span>
        <input
          key={view.balanceCents}
          className={goalStyles.valueInput}
          type="text"
          inputMode="decimal"
          defaultValue={formatMoneyInput(view.balanceCents, format)}
          onBlur={(e) => commit(e.currentTarget)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit(e.currentTarget)
          }}
        />
      </label>
      <p className={goalStyles.fieldHint}>{view.balanceHint}</p>
      <p className={goalStyles.fieldHint}>{named(view.sourceLine)}</p>
      {view.useCents !== null ? (
        <button type="button" className={goalStyles.btnText} onClick={() => onTyped(null)}>
          Use {formatCentsCompact(view.useCents, format)}
        </button>
      ) : null}
      {view.lowerLine ? <p className={goalStyles.fieldHint}>{named(view.lowerLine)}</p> : null}
      {view.houseNote ? (
        <>
          <p className={goalStyles.fieldHint}>{named(view.houseNote.text)}</p>
          {view.balanceCents === view.houseNote.cents ? null : (
            <button type="button" className={goalStyles.btnText} onClick={() => onTyped(view.houseNote!.cents)}>
              Use {formatCentsCompact(view.houseNote.cents, format)}
            </button>
          )}
        </>
      ) : null}
    </div>
  )
}

/** "Start date", and why the date cannot be used when it cannot. */
export function StartDateField(props: {
  source: NewGoalScenario
  date: string
  refusal: string | null
  onDate: (date: string) => void
  onPicker: (open: boolean) => void
}) {
  const { source, date, refusal } = props
  const start = source.planStartDate
  return (
    <div className={goalStyles.field}>
      <div className={goalStyles.fieldRow}>
        <span className={`${goalStyles.fieldLabel} ${styles.label}`}>Start date</span>
        <DateInput
          value={date}
          ariaLabel="Start date"
          min={start ?? undefined}
          max={start ? dateAtYears(start, source.horizonYears) : undefined}
          onChange={props.onDate}
          onTrapPausedChange={props.onPicker}
        />
      </div>
      {refusal ? (
        <p className={`${goalStyles.fieldHint} ${styles.refusal}`} role="alert">
          <Named text={refusal} source={source} />
        </p>
      ) : null}
    </div>
  )
}

/** What the copy comes to, then each rule behind it. */
export function Changes({ view, source }: { view: StartLaterView; source: NewGoalScenario }) {
  if (!view.outcome && view.lines.length === 0) return null
  return (
    <section className={styles.changes} data-start-later-changes aria-labelledby="start-later-changes">
      <h3 id="start-later-changes" className={goalStyles.sectionTitle}>
        What changes in the copy
      </h3>
      {view.outcome ? (
        <p className={styles.outcome}>
          <Named text={view.outcome} source={source} />
        </p>
      ) : null}
      <ul className={styles.lines}>
        {view.lines.map((line) => (
          <li key={line}>
            <Named text={line} source={source} />
          </li>
        ))}
      </ul>
    </section>
  )
}
