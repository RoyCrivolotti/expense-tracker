import { Fragment, useMemo, useRef, useState, type ReactNode } from 'react'
import type { GoalScenario } from '../../../types'
import type { NewGoalScenario } from '../../../data/dataSource'
import { SCENARIO_NAME_MAX_LENGTH, dateAtYears, formatCentsCompact, formatMoneyInput, tryParseMoneyToCents } from '../../../engine'
import { DateInput } from '../../components/DateInput'
import { Modal } from '../../components/Modal'
import { todayIso } from '../../components/transactionFormState'
import { useAssumedInflation } from '../../hooks/assumedInflationContext'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import { formatCheckinDate, type InvestedSnapshot } from './checkinDate'
import { scenarioInk } from './scenarioInk'
import { defaultStartDate, startLaterView, type StartLaterChoice, type StartLaterView } from './startLaterModel'
import goalStyles from './goals.module.css'
import styles from './StartLaterSheet.module.css'

/** What the sheet needs from the editor: what it copies, what it starts from, and the way to save the copy. */
export interface StartLater {
  /** The draft, unsaved edits included, as Duplicate copies it. Nothing here writes to it. */
  source: NewGoalScenario
  checkins: readonly InvestedSnapshot[]
  scenarios: readonly GoalScenario[]
  /** Saves the copy and opens it; a second call while one is being made does nothing. */
  onCreate: (input: NewGoalScenario) => void
}

interface SheetProps extends StartLater {
  onClose: () => void
}

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
function BalanceField({ view, source, onTyped }: { view: StartLaterView; source: NewGoalScenario; onTyped: (cents: number | null) => void }) {
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
function StartDateField(props: { source: NewGoalScenario; date: string; refusal: string | null; onDate: (date: string) => void; onPicker: (open: boolean) => void }) {
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
function Changes({ view, source }: { view: StartLaterView; source: NewGoalScenario }) {
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

/**
 * "Start a copy later…": a copy of the scenario that starts on a later date, from a balance the person
 * confirms, with what is typed in the euros of the old start restated in those of the new one. It says
 * what the copy changes before it is made, and making it leaves the scenario it came from as it was.
 */
export function StartLaterSheet({ onCreate, onClose, ...live }: SheetProps) {
  // Held from when the sheet opened: creating opens the copy, and the sheet leaving over it should still name its source.
  const [{ source, checkins, scenarios }] = useState(live)
  const format = useMoneyFormat()
  const inflationRate = useAssumedInflation()
  const [today] = useState(todayIso)
  const [choice, setChoice] = useState<StartLaterChoice>(() => ({ date: defaultStartDate(checkins, today), typedCents: null, typedName: null }))
  const [pickerOpen, setPickerOpen] = useState(false)
  const view = useMemo(
    () => startLaterView({ source, checkins, scenarios, inflationRate, today, format, formatDate: formatCheckinDate }, choice),
    [source, checkins, scenarios, inflationRate, today, format, choice],
  )
  const set = (patch: Partial<StartLaterChoice>) => setChoice((c) => ({ ...c, ...patch }))
  // The sheet is inert once it starts leaving, but a second press can land in the same frame as the first.
  const created = useRef(false)
  const create = () => {
    if (!view.input || created.current) return
    created.current = true
    onCreate(view.input)
    onClose()
  }
  return (
    <Modal title={`Start a copy of "${source.name}" later`} onClose={onClose} trapPaused={pickerOpen}>
      <div className={styles.body}>
        <StartDateField source={source} date={choice.date} refusal={view.refusal} onDate={(date) => set({ date })} onPicker={setPickerOpen} />
        {view.refusal ? null : <BalanceField view={view} source={source} onTyped={(typedCents) => set({ typedCents })} />}
        {view.refusal ? null : <Changes view={view} source={source} />}
        <label className={goalStyles.field}>
          <span className={goalStyles.fieldLabel}>Name</span>
          <input
            className={goalStyles.renameInput}
            value={view.name}
            maxLength={SCENARIO_NAME_MAX_LENGTH}
            onChange={(e) => set({ typedName: e.target.value })}
          />
        </label>
        <div className={styles.actions}>
          <button type="button" className={goalStyles.btn} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={`${goalStyles.btn} ${goalStyles.btnPrimary}`} disabled={!view.input} onClick={create}>
            Create scenario
          </button>
        </div>
      </div>
    </Modal>
  )
}
