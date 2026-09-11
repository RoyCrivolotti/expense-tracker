import type { ReactNode } from 'react'
import type { Transaction, TxnType } from '../../types'
import type { DescriptionSuggestion } from '../../data/descriptionIndex'
import { defaultBudgetMonth, shortDateLabel, shortMonthYearLabel } from '../../engine/dates'
import type { ExpenseModel } from '../useExpenseData'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import { DescriptionCombobox } from './DescriptionCombobox'
import { NativeDateOverlay } from './NativeDateOverlay'
import { optionLabel, selectableOptions } from './pickerOptions'
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
      <Field label="Account">
        <select value={form.accountId} onChange={(e) => set('accountId', Number(e.target.value))}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {optionLabel(a)}
            </option>
          ))}
        </select>
      </Field>
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
        <NativeDateOverlay
          type="date"
          value={form.date}
          label={shortDateLabel(form.date)}
          ariaLabel="Date"
          onChange={onDate}
        />
      </Field>
      <Field label="Budget month" as="div">
        <NativeDateOverlay
          type="month"
          value={form.budgetMonth}
          label={shortMonthYearLabel(form.budgetMonth)}
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
}

export function Fields({ form, set, model, editing, onAcceptSuggestion }: FieldsProps) {
  const format = useMoneyFormat()
  const onDate = (v: string) => {
    set('date', v)
    if (!editing) set('budgetMonth', defaultBudgetMonth(v, model.dataset.settings.budgetRolloverDay))
  }
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
      <Field label="Notes">
        <input value={form.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>
    </>
  )
}
