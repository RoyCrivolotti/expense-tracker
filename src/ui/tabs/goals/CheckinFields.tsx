import type { WealthAccount } from '../../../types'
import { formatMoneyInput, type MoneyFormat } from '../../../engine'
import type { EntryDraft } from './useCheckinDraft'
import styles from './progress.module.css'
import goalStyles from './goals.module.css'

/** One account's balance: typed over, with Save waking as it is typed and text that is not an amount put back. */
export function BalanceRow({
  acc,
  entry,
  format,
  holdOnEntry,
  readBalance,
  setEntry,
  commitBalance,
}: {
  acc: WealthAccount
  entry: EntryDraft
  format: MoneyFormat
  holdOnEntry: (entry: EntryDraft) => void
  readBalance: (raw: string) => number | null
  setEntry: (
    accountId: number,
    valueCents: number,
  ) => void
  commitBalance: (
    input: HTMLInputElement,
    entry: EntryDraft,
  ) => void
}) {
  return (
    <>
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
        onFocus={(e) => {
          holdOnEntry(entry)
          e.currentTarget.select()
        }}
        // On every keystroke too, so Save wakes up as the first balance is typed
        // rather than only once the field is left. Text that is not an amount ("250k") is no
        // keystroke's amount: leaving the field puts back what the box held when it was entered.
        onChange={(e) => {
          const cents = readBalance(e.target.value)
          if (cents !== null) setEntry(entry.accountId, cents)
        }}
        onBlur={(e) => commitBalance(e.currentTarget, entry)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commitBalance(e.currentTarget, entry)
        }}
      />
    </>
  )
}

/** The note a check-in can carry. */
export function NoteField({ note, setNote }: { note: string; setNote: (note: string) => void }) {
  return (
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
  )
}

/** Why the check-in cannot be saved yet or was not, and the buttons to save it or leave. */
export function CheckinActions({
  error,
  empty,
  submitting,
  date,
  handleSubmit,
  onDone,
}: {
  error: string | null
  empty: boolean
  submitting: boolean
  date: string
  handleSubmit: () => Promise<void>
  onDone: (() => void) | undefined
}) {
  return (
    <>
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
          onClick={() => {
            void handleSubmit()
          }}
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
    </>
  )
}
