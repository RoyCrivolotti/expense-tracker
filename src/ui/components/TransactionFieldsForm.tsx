import { useRef, useState, type ReactNode } from 'react'
import type { Transaction } from '../../types'
import type { DescriptionSuggestion } from '../../data/descriptionIndex'
import { RECEIPT_CLIENT_POLICY } from '../../data/receiptClientPolicy'
import type { ExpenseModel } from '../useExpenseData'
import type { DuplicateOffer, ExpenseActions, TransactionSeed } from '../actions'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import { ClearableDescription } from './ClearableDescription'
import { resolveInvestmentCategoryId } from '../../data/investmentCategory'
import type { PendingReceipt } from '../../data/pendingReceipts'
import { ActionRows, ReadOnlyRows } from './TransactionFieldActions'
import { useReceipts } from './useReceipts'
import { SeedAddons, SeedOpening } from './SeedAddons'
import { dateChanger, type FormFields, type Setter } from './transactionFormState'
import { BudgetMonthLine, DescriptionLine, FirstPaymentLine } from '../tips/FormLines'
import { Field } from './TransactionFields'
import { CategoryAccountRow, DateBudgetRow, TypeChips } from './TransactionFieldRows'
import styles from './TransactionForm.module.css'

interface FieldsProps {
  form: FormFields
  set: Setter
  model: ExpenseModel
  editing: Transaction | null
  onAcceptSuggestion: (suggestion: DescriptionSuggestion) => void
  /** Lets an enclosing Modal pause its focus trap while a popover is open. */
  onTrapPausedChange?: ((paused: boolean) => void) | undefined
  /** Receipts chosen before the row exists; owned by TransactionForm. */
  pendingFiles?: PendingReceipt[]
  onPendingChange?: ((files: PendingReceipt[]) => void) | undefined
  /**
   * Which row receipts hang off. The edited row normally, but on the add form
   * it becomes the id of the row just created when its uploads failed — so the
   * strip flips to live mode and the retry lands on the right transaction.
   */
  receiptTargetId?: number | null
  /** Absent in read-only sessions, which is also when receipts are hidden. */
  actions?: ExpenseActions | undefined
  /** What the form was opened for, which may ask about the card or note the date. */
  seed?: TransactionSeed | undefined
  duplicate?: DuplicateOffer | undefined
  /**
   * The installment-plan toggle, rendered as a chip alongside "Add receipt" /
   * "Add note" when there's nothing to say about it yet ("Not part of a
   * plan"). Owned by TransactionForm, which also decides when the link
   * carries enough to say (a plan just attached, or already linked) that it
   * needs a full-width row of its own instead — passed there, not here.
   */
  installmentChip?: ReactNode
}

const NO_PENDING: PendingReceipt[] = []

function DescriptionField({
  form,
  set,
  model,
  editing,
  seed,
  onAcceptSuggestion,
}: {
  form: FormFields
  set: Setter
  model: ExpenseModel
  editing: Transaction | null
  seed: TransactionSeed | undefined
  onAcceptSuggestion: (suggestion: DescriptionSuggestion) => void
}) {
  return (
    <Field label="Description">
      {editing ? (
        <input
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          placeholder="e.g. Mercadona"
        />
      ) : (
        <ClearableDescription
          seed={seed}
          value={form.description}
          index={model.descriptionIndex}
          onChange={(v) => set('description', v)}
          onAccept={onAcceptSuggestion}
        />
      )}
    </Field>
  )
}

export function Fields(props: FieldsProps) {
  const { form, set, model, editing, onTrapPausedChange, actions, seed } = props
  const { pendingFiles = NO_PENDING, receiptTargetId = null } = props
  const format = useMoneyFormat()
  const [noteExpanded, setNoteExpanded] = useState(form.notes !== '')
  const receiptInputRef = useRef<HTMLInputElement>(null)

  const onDate = dateChanger(model, editing, set)

  const investmentCategoryId = resolveInvestmentCategoryId(model.dataset.categories, model.dataset.settings)
  const { attachments, count: receiptCount } = useReceipts(model, receiptTargetId)
  const receiptAtCap = receiptCount + pendingFiles.length >= RECEIPT_CLIENT_POLICY.maxPerTransaction

  return (
    <>
      <SeedOpening seed={seed} model={model} duplicate={props.duplicate} />
      <FirstPaymentLine model={model} editing={editing !== null} />
      <TypeChips form={form} set={set} investmentCategoryId={investmentCategoryId} />
      <Field label={`Amount (${format.symbol})`}>
        {/* Not focused on opening: the sheet first shows the whole payment, and a keyboard comes up for a tap. */}
        <input
          className={styles.amount}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={form.amount}
          onChange={(e) => set('amount', e.target.value)}
          required
        />
      </Field>
      <DescriptionField
        form={form}
        set={set}
        model={model}
        editing={editing}
        seed={seed}
        onAcceptSuggestion={props.onAcceptSuggestion}
      />
      <DescriptionLine model={model} editing={editing !== null} />
      <CategoryAccountRow form={form} set={set} model={model} investmentCategoryId={investmentCategoryId} />
      <DateBudgetRow form={form} set={set} onDate={onDate} onTrapPausedChange={onTrapPausedChange} />
      <BudgetMonthLine model={model} form={form} editing={editing !== null} />
      <SeedAddons seed={seed} form={form} set={set} model={model} onDate={onDate} />

      {actions ? (
        <ActionRows
          {...{ form, set, model, editing, actions, onTrapPausedChange, pendingFiles, receiptTargetId }}
          onPendingChange={props.onPendingChange}
          attachments={attachments}
          receiptAtCap={receiptAtCap}
          installmentChip={props.installmentChip}
          noteExpanded={noteExpanded}
          setNoteExpanded={setNoteExpanded}
          receiptInputRef={receiptInputRef}
        />
      ) : (
        <ReadOnlyRows form={form} set={set} model={model} onTrapPausedChange={onTrapPausedChange} />
      )}
    </>
  )
}
