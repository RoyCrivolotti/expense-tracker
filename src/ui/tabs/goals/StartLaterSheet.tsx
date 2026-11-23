import { useMemo, useRef, useState } from 'react'
import type { GoalScenario } from '../../../types'
import type { NewGoalScenario } from '../../../data/dataSource'
import { SCENARIO_NAME_MAX_LENGTH } from '../../../engine'
import { Modal } from '../../components/Modal'
import { todayIso } from '../../components/transactionFormState'
import { useAssumedInflation } from '../../hooks/assumedInflationContext'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import { formatCheckinDate, type InvestedSnapshot } from './checkinDate'
import { startLaterView, type StartLaterChoice } from './startLaterModel'
import { defaultStartDate } from './startLaterRules'
import goalStyles from './goals.module.css'
import styles from './StartLaterSheet.module.css'
import { BalanceField, Changes, StartDateField } from './StartLaterFields'

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
  const [choice, setChoice] = useState<StartLaterChoice>(() => ({
    date: defaultStartDate(checkins, today),
    typedCents: null,
    typedName: null,
  }))
  const [pickerOpen, setPickerOpen] = useState(false)
  const view = useMemo(
    () =>
      startLaterView(
        { source, checkins, scenarios, inflationRate, today, format, formatDate: formatCheckinDate },
        choice,
      ),
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
        <StartDateField
          source={source}
          date={choice.date}
          refusal={view.refusal}
          onDate={(date) => set({ date })}
          onPicker={setPickerOpen}
        />
        {view.refusal ? null : (
          <BalanceField view={view} source={source} onTyped={(typedCents) => set({ typedCents })} />
        )}
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
          <button
            type="button"
            className={`${goalStyles.btn} ${goalStyles.btnPrimary}`}
            disabled={!view.input}
            onClick={create}
          >
            Create scenario
          </button>
        </div>
      </div>
    </Modal>
  )
}
