import {
  creditedCents,
  leftOwedCents,
  paymentForSelection,
  selectedTotalCents,
  type ReimbursementDraft,
} from '../../domain/engine/reimbursementDraft'
import { formatCents, type MoneyFormat } from '../../engine/money'
import { Field } from '../components/TransactionFields'
import formStyles from '../components/TransactionForm.module.css'
import type { ExpenseModel } from '../useExpenseData'
import type { ReimbursementState } from './useReimbursementState'
import { ReimbursementDestination, ReimbursementSummary } from './ReimbursementParts'
import styles from './RecordReimbursementSheet.module.css'

interface FieldsProps {
  draft: ReimbursementDraft
  model: ExpenseModel
  format: MoneyFormat
  state: ReimbursementState
  cents: number
  error: string | null | undefined
  busy: boolean
  onRecord: () => void
}

/** Everything under the ticked lines: what they add up to, the amount received, the name and where it lands. */
export function ReimbursementFields({ draft, model, format, state, cents, error, busy, onRecord }: FieldsProps) {
  const { selected } = state
  return (
    <>
      <ReimbursementSummary
        draft={draft}
        selectedCount={selected.size}
        selectedCents={selectedTotalCents(draft.candidates, selected)}
        // What the Flagged card will show once this lands, so the two screens agree: the
        // unticked lines less any refund already on the flag.
        notCovered={leftOwedCents(draft, selected)}
        alreadyBack={creditedCents(draft)}
        format={format}
      />

      <ReimbursementAmount
        amount={state.amount}
        onAmountChange={(value) => {
          state.setAmount(value)
          state.setAmountEdited(true)
        }}
        cents={cents}
        owedCents={paymentForSelection(draft, selected)}
        name={state.name}
        onNameChange={state.setName}
        placeholder={draft.description}
        format={format}
      />

      <ReimbursementDestination
        model={model}
        date={state.date}
        onDateChange={state.setDate}
        onTrapPausedChange={state.setDatePopoverOpen}
        accountId={state.accountId}
        onAccountChange={state.setAccountId}
        categoryId={state.categoryId}
        onCategoryChange={state.setCategoryId}
      />

      <ReimbursementFooter
        error={error}
        busy={busy}
        cents={cents}
        disabled={cents <= 0 || selected.size === 0}
        onRecord={onRecord}
        format={format}
      />
    </>
  )
}

/**
 * Says so when the figure typed does not match what the ticked rows are owed.
 *
 * Ticking is what settles a row — the amount is recorded but never reconciled
 * against it — so typing 900 while 1.000 of lines are ticked marks all of them
 * paid and quietly stops tracking the missing 100. Nothing said so before: the
 * sheet computed both numbers and never compared them.
 *
 * Measured against what is owed, not the gross of the lines: a payment that
 * closes a claim is expected to fall short of the lines by whatever refund is
 * already on the flag, and warning about that would tell the user to untick
 * lines that were in fact paid.
 *
 * Its own component so the parent keeps its branches; that component sits on
 * the complexity ceiling of 12.
 */
function AmountNote({ cents, owedCents, format }: { cents: number; owedCents: number; format: MoneyFormat }) {
  const difference = cents - owedCents
  if (difference === 0 || owedCents === 0) return null
  // One interpolated string rather than interleaved nodes: React splits the
  // latter into separate text nodes, which puts the figures beyond any matcher
  // reading the sentence as a whole — screen readers included.
  const lead = difference < 0 ? 'Short of' : 'More than'
  const gap = `${lead} the ${formatCents(owedCents, format)} owed for the ticked lines, by ${formatCents(Math.abs(difference), format)}.`
  return (
    <p className={styles.mismatch} role="status">
      {`${gap} Ticked lines are settled either way — untick anything this payment did not cover.`}
    </p>
  )
}

/** The figure the employer paid, what it is called, and the note when the figure and the ticks disagree. */
function ReimbursementAmount({
  amount,
  onAmountChange,
  cents,
  owedCents,
  name,
  onNameChange,
  placeholder,
  format,
}: {
  amount: string
  onAmountChange: (amount: string) => void
  cents: number
  owedCents: number
  name: string
  onNameChange: (name: string) => void
  placeholder: string
  format: MoneyFormat
}) {
  return (
    <>
      <Field label={`Amount received (${format.symbol})`} as="div">
        <input
          className={formStyles.input}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          aria-label="Amount received"
          value={amount}
          onChange={(e) => onAmountChange(e.target.value)}
        />
      </Field>

      <AmountNote cents={cents} owedCents={owedCents} format={format} />

      <Field label="Report name" as="div">
        <input
          className={formStyles.input}
          type="text"
          autoComplete="off"
          aria-label="Report name"
          value={name}
          placeholder={placeholder}
          onChange={(e) => onNameChange(e.target.value)}
        />
      </Field>
      <p className={styles.hint}>
        What this settlement is called in Past reports, and the description on the transaction it creates.
      </p>
    </>
  )
}

function ReimbursementFooter({
  error,
  busy,
  cents,
  disabled,
  onRecord,
  format,
}: {
  error: string | null | undefined
  busy: boolean
  cents: number
  disabled: boolean
  onRecord: () => void
  format: MoneyFormat
}) {
  return (
    <>
      {error ? (
        <p className={formStyles.error} role="alert">
          {error}
        </p>
      ) : null}

      <div className={formStyles.actions}>
        <button type="button" className={`${formStyles.save} tapActive`} disabled={busy || disabled} onClick={onRecord}>
          {busy ? 'Recording…' : `Record ${formatCents(cents, format)}`}
        </button>
      </div>
    </>
  )
}
