import type { ReimbursementDraft } from '../../domain/engine/reimbursementDraft'
import { formatCents, type MoneyFormat } from '../../engine/money'
import { DateInput } from '../components/DateInput'
import { Field } from '../components/TransactionFields'
import { optionLabel, selectableOptions } from '../components/pickerOptions'
import formStyles from '../components/TransactionForm.module.css'
import { formatDayLabel, type Lookup } from '../format'
import type { ExpenseModel } from '../useExpenseData'
import styles from './RecordReimbursementSheet.module.css'

/** The claimed rows, each with the tick that says this payment covers it. */
export function ReimbursementLines({
  draft,
  selected,
  onToggle,
  lookup,
  format,
}: {
  draft: ReimbursementDraft
  selected: Set<number>
  onToggle: (id: number) => void
  lookup: Lookup
  format: MoneyFormat
}) {
  return (
    <ul className={styles.lines}>
      {draft.candidates.map((txn) => (
        <li key={txn.id}>
          <label className={styles.line}>
            <input type="checkbox" checked={selected.has(txn.id)} onChange={() => onToggle(txn.id)} />
            <span className={styles.lineBody}>
              <span className={styles.lineDesc}>{txn.description || lookup.categoryName(txn.categoryId)}</span>
              <span className={styles.lineMeta}>{formatDayLabel(txn.date)}</span>
            </span>
            <span className={styles.lineAmount}>
              {formatCents(txn.type === 'refund' ? -txn.amountCents : txn.amountCents, format)}
            </span>
          </label>
        </li>
      ))}
    </ul>
  )
}

export function ReimbursementSummary({
  draft,
  selectedCount,
  selectedCents,
  notCovered,
  alreadyBack,
  format,
}: {
  draft: ReimbursementDraft
  selectedCount: number
  selectedCents: number
  notCovered: number
  alreadyBack: number
  format: MoneyFormat
}) {
  return (
    <>
      <p className={styles.summary}>
        {selectedCount} of {draft.candidates.length} selected · {formatCents(selectedCents, format)}
        {notCovered > 0 ? (
          <span className={styles.remaining}> · {formatCents(notCovered, format)} left owed</span>
        ) : null}
      </p>
      {alreadyBack > 0 ? (
        <p className={styles.credit}>
          {formatCents(alreadyBack, format)} already back on this flag comes off what is owed.
        </p>
      ) : null}
    </>
  )
}

/** Where the money lands: the date, the account it goes into and the category it is credited to. */
export function ReimbursementDestination({
  model,
  date,
  onDateChange,
  onTrapPausedChange,
  accountId,
  onAccountChange,
  categoryId,
  onCategoryChange,
}: {
  model: ExpenseModel
  date: string
  onDateChange: (date: string) => void
  onTrapPausedChange: (paused: boolean) => void
  accountId: number
  onAccountChange: (accountId: number) => void
  categoryId: number
  onCategoryChange: (categoryId: number) => void
}) {
  return (
    <>
      <div className={formStyles.row}>
        <Field label="Date" as="div">
          <DateInput value={date} ariaLabel="Date" onChange={onDateChange} onTrapPausedChange={onTrapPausedChange} />
        </Field>
        <Field label="Into account">
          <select
            className={formStyles.input}
            value={accountId}
            onChange={(e) => onAccountChange(Number(e.target.value))}
          >
            {selectableOptions(model.dataset.accounts, accountId).map((a) => (
              <option key={a.id} value={a.id}>
                {optionLabel(a)}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Credited to">
        <select
          className={formStyles.input}
          value={categoryId}
          onChange={(e) => onCategoryChange(Number(e.target.value))}
        >
          {selectableOptions(model.dataset.categories, categoryId).map((c) => (
            <option key={c.id} value={c.id}>
              {optionLabel(c)}
            </option>
          ))}
        </select>
      </Field>
      <p className={styles.hint}>
        Credited to the category the selected rows spent most in, in this month&rsquo;s budget — change either if
        you&rsquo;d rather book it elsewhere.
      </p>
    </>
  )
}
