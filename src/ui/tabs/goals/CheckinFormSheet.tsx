import { useState } from 'react'
import type { WealthAccount, WealthCheckin } from '../../../types'
import type { ExpenseActions } from '../../actions'
import { Card } from '../../components/primitives'
import { DateInput } from '../../components/DateInput'
import { todayIso } from '../../components/transactionFormState'
import { formatMoneyInput, parseMoneyToCents } from '../../../engine'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import styles from './progress.module.css'
import goalStyles from './goals.module.css'

interface Props {
  accounts: WealthAccount[]
  /**
   * The previous check-in, whose balances the form starts from. Most accounts move a
   * little between check-ins, so editing last month's figure beats retyping every one
   * from zero, and an account nothing changed in needs no touch at all.
   */
  previous?: WealthCheckin | null
  actions: ExpenseActions
  onDone?: () => void
}

type EntryDraft = { accountId: number; valueCents: number }

export function CheckinFormSheet({ accounts, previous = null, actions, onDone }: Props) {
  const format = useMoneyFormat()
  // Local date, not UTC. East of UTC these differ for part of every day, and a UTC
  // "today" would default the field to yesterday and cap it there — leaving the user's
  // actual today unselectable while the grid still marks it as today. The server's one
  // day of slack exists to accept exactly this.
  const today = todayIso()
  const [date, setDate] = useState(today)
  const [note, setNote] = useState('')
  const active = accounts.filter((a) => !a.archived)

  const [entries, setEntries] = useState<EntryDraft[]>(() =>
    active.map((a) => ({
      accountId: a.id,
      valueCents: previous?.entries.find((e) => e.accountId === a.id)?.valueCents ?? 0,
    })),
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Which fields the user has been in. A zero the user typed, or one carried over from
  // the previous check-in, is a balance; a zero left on an account they never touched
  // is not. The form only creates, so a field never starts from this check-in's own row.
  const [touched, setTouched] = useState<ReadonlySet<number>>(() => new Set())

  const setEntry = (accountId: number, valueCents: number) => {
    setEntries((prev) =>
      prev.map((e) => (e.accountId === accountId ? { ...e, valueCents } : e)),
    )
    setTouched((prev) => (prev.has(accountId) ? prev : new Set(prev).add(accountId)))
  }
  const recorded = (e: EntryDraft) =>
    e.valueCents !== 0 ||
    touched.has(e.accountId) ||
    previous?.entries.some((p) => p.accountId === e.accountId) === true

  // A check-in with every balance at zero says nothing, yet it would silence the
  // dashboard's nudge for a month and read as being behind by the whole plan.
  const empty = entries.every((e) => e.valueCents === 0)

  const handleSubmit = async () => {
    if (!date || empty) return
    setSubmitting(true)
    setError(null)
    try {
      const trimmedNote = note.trim()
      await actions.createWealthCheckin({
        checkinDate: date,
        ...(trimmedNote ? { note: trimmedNote } : {}),
        entries: entries.filter(recorded),
      })
      onDone?.()
    } catch (e) {
      // Without this the save fails in silence: the button simply re-enables and
      // nothing on screen says why. The server refuses a future-dated check-in, and
      // a clock a day ahead of the server's slack is enough to reach that.
      setError(e instanceof Error ? e.message : 'Could not save the check-in')
    } finally {
      setSubmitting(false)
    }
  }

  const accountById = (id: number) => active.find((a) => a.id === id)

  if (active.length === 0) {
    return (
      <Card>
        <h3 className={goalStyles.sectionTitle}>New check-in</h3>
        <p className={styles.emptyHint}>
          Add at least one wealth account before logging a check-in.
        </p>
      </Card>
    )
  }

  return (
    <Card>
      <h3 className={goalStyles.sectionTitle}>New check-in</h3>
      <div className={styles.checkinForm}>
        <div className={styles.formField}>
          <span className={styles.formLabel}>Date</span>
          <DateInput
            value={date}
            ariaLabel="Date"
            max={today}
            onChange={setDate}
          />
        </div>

        <div className={styles.formField}>
          <span className={styles.formLabel}>Account values</span>
          {entries.map((entry) => {
            const acc = accountById(entry.accountId)
            if (!acc) return null
            return (
              <div key={entry.accountId} className={styles.accountValueRow}>
                <span className={styles.accountValueLabel}>{acc.name}</span>
                <input
                  key={entry.accountId}
                  className={[styles.formInput, styles.formInputNarrow].join(' ')}
                  type="text"
                  inputMode="decimal"
                  aria-label={`Value for ${acc.name}`}
                  // A zero starts empty, not as "0,00": typing into a prefilled zero appends
                  // ("0,005000"), and an empty field says plainly that nothing is entered yet.
                  defaultValue={entry.valueCents === 0 ? '' : formatMoneyInput(entry.valueCents, format)}
                  placeholder={formatMoneyInput(0, format)}
                  onFocus={(e) => e.currentTarget.select()}
                  // On every keystroke too, so Save wakes up as the first balance is typed
                  // rather than only once the field is left.
                  onChange={(e) => setEntry(entry.accountId, parseMoneyToCents(e.target.value, format))}
                  onBlur={(e) =>
                    setEntry(entry.accountId, parseMoneyToCents(e.target.value, format))
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter')
                      setEntry(entry.accountId, parseMoneyToCents(e.currentTarget.value, format))
                  }}
                />
              </div>
            )
          })}
        </div>

        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="checkin-note">
            Note <span style={{ fontWeight: 400 }}>(optional)</span>
          </label>
          <input
            id="checkin-note"
            className={styles.formInput}
            type="text"
            placeholder="e.g. market correction, bonus received…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {error ? (
          <p className={styles.formError} role="alert">
            {error}
          </p>
        ) : null}
        {empty ? (
          <p className={styles.formHint} role="status">
            Enter at least one balance to save.
          </p>
        ) : null}

        <div className={styles.formActions}>
          <button
            className={goalStyles.btn}
            onClick={() => { void handleSubmit() }}
            disabled={submitting || !date || empty}
          >
            {submitting ? 'Saving…' : 'Save check-in'}
          </button>
          {onDone ? (
            <button
              className={goalStyles.btn}
              style={{ background: 'none', color: 'var(--color-text-muted)' }}
              onClick={onDone}
            >
              Cancel
            </button>
          ) : null}
        </div>
      </div>
    </Card>
  )
}
