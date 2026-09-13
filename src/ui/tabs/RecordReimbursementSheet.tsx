import { useState } from 'react'
import type { FlagGroup } from '../../domain/engine/flagGroups'
import {
  buildReimbursementDraft,
  selectedTotalCents,
} from '../../domain/engine/reimbursementDraft'
import { formatCents, formatMoneyInput, parseMoneyToCents } from '../../engine/money'
import { resolveDefaultAccountId } from '../../data/defaultAccount'
import { todayIso } from '../components/transactionFormState'
import { defaultBudgetMonth } from '../../engine/dates'
import type { ExpenseModel } from '../useExpenseData'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import { Modal } from '../components/Modal'
import { DateInput } from '../components/DateInput'
import { Field } from '../components/TransactionFields'
import { optionLabel, selectableOptions } from '../components/pickerOptions'
import { formatDayLabel } from '../format'
import formStyles from '../components/TransactionForm.module.css'
import styles from './RecordReimbursementSheet.module.css'

interface Props {
  group: FlagGroup
  model: ExpenseModel
  busy: boolean
  /** Set when the last attempt failed; the payment was rolled back. */
  error?: string | null
  onCancel: () => void
  onRecord: (input: RecordInput, transactionIds: number[]) => void
}

export interface RecordInput {
  date: string
  budgetMonth: string
  description: string
  accountId: number
  categoryId: number
  amountCents: number
}

/**
 * Record what an employer actually paid, against the lines it actually covered.
 *
 * Its own sheet rather than the prefilled transaction editor: the thing being
 * chosen here is *which* claimed rows this payment clears, and the generic
 * editor has nowhere to put that. Everything else — amount, date, account,
 * category — stays editable, because a payment is rarely exactly the claim.
 */
export function RecordReimbursementSheet({ group, model, busy, error, onCancel, onRecord }: Props) {
  const format = useMoneyFormat()
  const draft = buildReimbursementDraft(
    group,
    model.dataset.accounts,
    resolveDefaultAccountId(model.dataset.accounts, model.dataset.settings),
  )

  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(draft?.selectedIds ?? []),
  )
  const [amount, setAmount] = useState(() =>
    formatMoneyInput(draft?.amountCents ?? 0, format),
  )
  // Whether the figure still tracks the ticks. Once it has been typed over it
  // stops moving on its own — an employer's payment is often not the claim total,
  // and silently rewriting what was typed would be worse than a stale default.
  const [amountEdited, setAmountEdited] = useState(false)
  const [date, setDate] = useState(todayIso())
  const [accountId, setAccountId] = useState(draft?.accountId ?? 0)
  const [categoryId, setCategoryId] = useState(draft?.categoryId ?? 0)

  if (!draft) return null

  const toggle = (id: number) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
    if (!amountEdited) setAmount(formatMoneyInput(selectedTotalCents(draft.candidates, next), format))
  }

  const cents = Math.abs(parseMoneyToCents(amount, format))
  const selectedCents = selectedTotalCents(draft.candidates, selected)
  // What this payment leaves behind, measured against the lines on screen rather
  // than the flag's net total — the flag's total already nets any vendor refund,
  // which is not a line anyone is reimbursing.
  const notCovered = selectedTotalCents(
    draft.candidates,
    draft.candidates.filter((t) => !selected.has(t.id)).map((t) => t.id),
  )

  const record = () => {
    onRecord(
      {
        date,
        budgetMonth: defaultBudgetMonth(date, model.dataset.settings.budgetRolloverDay),
        description: draft.description,
        accountId,
        categoryId,
        amountCents: cents,
      },
      [...selected],
    )
  }

  return (
    <Modal
      title="Record reimbursement"
      subtitle={group.flag.name}
      onClose={onCancel}
    >
      <p className={styles.lead}>Tick what this payment covers. Anything left unticked stays owed.</p>

      <ul className={styles.lines}>
        {draft.candidates.map((txn) => (
          <li key={txn.id}>
            <label className={styles.line}>
              <input
                type="checkbox"
                checked={selected.has(txn.id)}
                onChange={() => toggle(txn.id)}
              />
              <span className={styles.lineBody}>
                <span className={styles.lineDesc}>
                  {txn.description || model.lookup.categoryName(txn.categoryId)}
                </span>
                <span className={styles.lineMeta}>{formatDayLabel(txn.date)}</span>
              </span>
              <span className={styles.lineAmount}>
                {formatCents(txn.type === 'refund' ? -txn.amountCents : txn.amountCents, format)}
              </span>
            </label>
          </li>
        ))}
      </ul>

      <p className={styles.summary}>
        {selected.size} of {draft.candidates.length} selected ·{' '}
        {formatCents(selectedCents, format)}
        {notCovered > 0 ? (
          <span className={styles.remaining}>
            {' '}
            · {formatCents(notCovered, format)} left owed
          </span>
        ) : null}
      </p>

      <Field label={`Amount received (${format.symbol})`} as="div">
        <input
          className={formStyles.input}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          aria-label="Amount received"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value)
            setAmountEdited(true)
          }}
        />
      </Field>

      <div className={formStyles.row}>
        <Field label="Date" as="div">
          <DateInput value={date} ariaLabel="Date" onChange={setDate} />
        </Field>
        <Field label="Into account">
          <select
            className={formStyles.input}
            value={accountId}
            onChange={(e) => setAccountId(Number(e.target.value))}
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
          onChange={(e) => setCategoryId(Number(e.target.value))}
        >
          {selectableOptions(model.dataset.categories, categoryId).map((c) => (
            <option key={c.id} value={c.id}>
              {optionLabel(c)}
            </option>
          ))}
        </select>
      </Field>
      <p className={styles.hint}>
        Credited to the category the selected rows spent most in, in this month&rsquo;s budget —
        change either if you&rsquo;d rather book it elsewhere.
      </p>

      {error ? (
        <p className={formStyles.error} role="alert">
          {error}
        </p>
      ) : null}

      <div className={formStyles.actions}>
        <button
          type="button"
          className={`${formStyles.save} tapActive`}
          disabled={busy || cents <= 0 || selected.size === 0}
          onClick={record}
        >
          {busy ? 'Recording…' : `Record ${formatCents(cents, format)}`}
        </button>
      </div>
    </Modal>
  )
}
