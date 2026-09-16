import { useState } from 'react'
import type { WealthAccount } from '../../../types'
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
  actions: ExpenseActions
  onDone?: () => void
}

type EntryDraft = { accountId: number; valueCents: number }

export function CheckinFormSheet({ accounts, actions, onDone }: Props) {
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
    active.map((a) => ({ accountId: a.id, valueCents: 0 })),
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setEntry = (accountId: number, valueCents: number) => {
    setEntries((prev) =>
      prev.map((e) => (e.accountId === accountId ? { ...e, valueCents } : e)),
    )
  }

  const handleSubmit = async () => {
    if (!date) return
    setSubmitting(true)
    setError(null)
    try {
      const trimmedNote = note.trim()
      await actions.createWealthCheckin({
        checkinDate: date,
        ...(trimmedNote ? { note: trimmedNote } : {}),
        entries: entries.filter((e) => e.valueCents !== 0),
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
                  defaultValue={formatMoneyInput(entry.valueCents, format)}
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

        <div className={styles.formActions}>
          <button
            className={goalStyles.btn}
            onClick={() => { void handleSubmit() }}
            disabled={submitting || !date}
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
