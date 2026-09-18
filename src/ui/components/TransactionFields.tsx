import { useRef, useState, type ReactNode } from 'react'
import type { Transaction, TxnType } from '../../types'
import type { DescriptionSuggestion } from '../../data/descriptionIndex'
import { defaultBudgetMonth } from '../../engine/dates'
import { RECEIPT_CLIENT_POLICY } from '../../data/receiptClientPolicy'
import type { ExpenseModel } from '../useExpenseData'
import type { ExpenseActions } from '../actions'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import { CameraIcon, PlusIcon } from '../icons'
import { DateInput } from './DateInput'
import { DescriptionCombobox } from './DescriptionCombobox'
import { MonthInput } from './MonthInput'
import { optionLabel, selectableOptions } from './pickerOptions'
import { FlagField } from './FlagField'
import { createFlagInPlace } from './quickFlag'
import type { PendingReceipt } from '../../data/pendingReceipts'
import { ReceiptStrip } from './ReceiptStrip'
import { ReimbursementLink } from './ReimbursementLink'
import type { FormFields, Setter } from './transactionFormState'
import styles from './TransactionForm.module.css'

const TYPES: { value: TxnType; label: string }[] = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'investment', label: 'Invest' },
  { value: 'refund', label: 'Refund' },
]

export function Field({
  label,
  children,
  as = 'label',
}: {
  label: string
  children: ReactNode
  /**
   * A <label> forwards a click anywhere in it — including the caption text —
   * to its wrapped control (that's how "click a checkbox's label" works).
   * NativeDateOverlay opens the native picker on click, so wrapping it in a
   * <label> means clicking the "Date"/"Budget month" caption also opens the
   * picker, not just the pill. Use 'div' there — it drops the implicit
   * label/control association (compensate with NativeDateOverlay's own
   * `ariaLabel`), scoping the click-to-open surface to the pill itself.
   */
  as?: 'label' | 'div'
}) {
  const Tag = as
  return (
    <Tag className={styles.field}>
      <span className={styles.label}>{label}</span>
      {children}
    </Tag>
  )
}

export function TypeSelector({ value, onChange }: { value: TxnType; onChange: (t: TxnType) => void }) {
  return (
    <div className={styles.types}>
      {TYPES.map((t) => (
        <button
          key={t.value}
          type="button"
          data-type={t.value}
          className={`${styles.typeBtn} ${value === t.value ? styles.typeActive : ''}`}
          onClick={() => onChange(t.value)}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

function CategoryAccountRow({
  form,
  set,
  model,
}: {
  form: FormFields
  set: Setter
  model: ExpenseModel
}) {
  const categories = selectableOptions(model.dataset.categories, form.categoryId)
  const accounts = selectableOptions(model.dataset.accounts, form.accountId)
  const selectedCategory = model.dataset.categories.find((c) => c.id === form.categoryId)
  const categoryInactive = selectedCategory != null && !selectedCategory.active
  const selectedAccount = model.dataset.accounts.find((a) => a.id === form.accountId)
  const accountInactive = selectedAccount != null && !selectedAccount.active
  return (
    <div className={styles.row}>
      <div className={styles.fieldStack}>
        <Field label="Category">
          <select value={form.categoryId} onChange={(e) => set('categoryId', Number(e.target.value))}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {optionLabel(c)}
              </option>
            ))}
          </select>
        </Field>
        {categoryInactive ? (
          <p className={styles.inactiveWarning}>This category is inactive</p>
        ) : null}
      </div>
      <div className={styles.fieldStack}>
        <Field label="Account">
          <select value={form.accountId} onChange={(e) => set('accountId', Number(e.target.value))}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {optionLabel(a)}
              </option>
            ))}
          </select>
        </Field>
        {accountInactive ? (
          <p className={styles.inactiveWarning}>This account is inactive</p>
        ) : null}
      </div>
    </div>
  )
}

function DateBudgetRow({
  form,
  set,
  onDate,
}: {
  form: FormFields
  set: Setter
  onDate: (value: string) => void
}) {
  return (
    <div className={styles.row}>
      <Field label="Date" as="div">
        <DateInput value={form.date} ariaLabel="Date" onChange={onDate} />
      </Field>
      <Field label="Budget month" as="div">
        <MonthInput
          value={form.budgetMonth}
          ariaLabel="Budget month"
          onChange={(value) => set('budgetMonth', value)}
        />
      </Field>
    </div>
  )
}

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

export function Fields({
  form,
  set,
  model,
  editing,
  onAcceptSuggestion,
  onTrapPausedChange,
  actions,
  pendingFiles = NO_PENDING,
  onPendingChange,
  receiptTargetId = null,
  installmentChip,
}: FieldsProps) {
  const format = useMoneyFormat()
  const [noteExpanded, setNoteExpanded] = useState(form.notes !== '')
  const receiptInputRef = useRef<HTMLInputElement>(null)

  const onDate = (v: string) => {
    set('date', v)
    if (!editing) set('budgetMonth', defaultBudgetMonth(v, model.dataset.settings.budgetRolloverDay))
  }

  const showNoteInput = noteExpanded || form.notes !== ''
  const attachments = receiptTargetId != null ? model.lookup.attachments(receiptTargetId) : []
  const receiptAtCap =
    attachments.length + pendingFiles.length >= RECEIPT_CLIENT_POLICY.maxPerTransaction

  return (
    <>
      <TypeSelector value={form.type} onChange={(t) => set('type', t)} />
      <Field label={`Amount (${format.symbol})`}>
        <input
          className={styles.amount}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={form.amount}
          onChange={(e) => set('amount', e.target.value)}
          autoFocus
          required
        />
      </Field>
      <Field label="Description">
        {editing ? (
          <input
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="e.g. Mercadona"
          />
        ) : (
          <DescriptionCombobox
            value={form.description}
            index={model.descriptionIndex}
            placeholder="e.g. Mercadona"
            onChange={(v) => set('description', v)}
            onAccept={onAcceptSuggestion}
          />
        )}
      </Field>
      <CategoryAccountRow form={form} set={set} model={model} />
      <DateBudgetRow form={form} set={set} onDate={onDate} />

      {actions ? (
        <>
          <div className={styles.chipRow}>
            <button
              type="button"
              className={styles.chip}
              disabled={receiptAtCap}
              onClick={() => receiptInputRef.current?.click()}
            >
              <span className={styles.chipIcon} aria-hidden>
                <CameraIcon />
              </span>
              {receiptAtCap ? 'Limit reached' : 'Add receipt'}
            </button>
            {!showNoteInput && (
              <button
                type="button"
                className={styles.chip}
                onClick={() => setNoteExpanded(true)}
              >
                <span className={styles.chipIcon} aria-hidden>
                  <PlusIcon />
                </span>
                Add note
              </button>
            )}
            <FlagField
              compact
              flags={model.dataset.flags}
              value={form.flagId}
              onChange={(flagId) => set('flagId', flagId)}
              onTrapPausedChange={onTrapPausedChange}
              onCreate={createFlagInPlace(actions, model.dataset.flags)}
            />
            {installmentChip}
          </div>
          {showNoteInput && (
            <Field label="Notes">
              <input
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                autoFocus={form.notes === ''}
                onBlur={() => {
                  if (form.notes === '') setNoteExpanded(false)
                }}
              />
            </Field>
          )}
          {editing ? (
            <ReimbursementLink editing={editing} lookup={model.lookup} onOpen={actions.onEdit} />
          ) : null}
          <ReceiptStrip
            {...(receiptTargetId != null ? { transactionId: receiptTargetId } : {})}
            attachments={attachments}
            actions={actions}
            pendingFiles={pendingFiles}
            onPendingChange={onPendingChange}
            onTrapPausedChange={onTrapPausedChange}
            externalInputRef={receiptInputRef}
            hideControls
          />
        </>
      ) : (
        <>
          <Field label="Notes">
            <input value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>
          <FlagField
            flags={model.dataset.flags}
            value={form.flagId}
            onChange={(flagId) => set('flagId', flagId)}
            onTrapPausedChange={onTrapPausedChange}
          />
        </>
      )}
    </>
  )
}
