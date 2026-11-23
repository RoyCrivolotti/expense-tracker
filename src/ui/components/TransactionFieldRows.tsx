import type { ExpenseModel } from '../useExpenseData'
import { DateInput } from './DateInput'
import { MonthInput } from './MonthInput'
import { optionLabel, selectableOptions } from './pickerOptions'
import type { FormFields, Setter } from './transactionFormState'
import { FORM_TYPES, typeChoice, typeHint } from './transactionTypes'
import { TypeHintLine } from '../tips/FormLines'
import { Field, TypeSelector } from './TransactionFields'
import styles from './TransactionForm.module.css'

/**
 * The type chips, and under them a line for the types that need a word: Withdraw, which is an investment with the
 * money going the other way and is easy to take for something else, and Invest and Refund. It stays while the type is picked.
 */
export function TypeChips({
  form,
  set,
  investmentCategoryId,
}: {
  form: FormFields
  set: Setter
  investmentCategoryId: number | null
}) {
  return (
    <>
      <TypeSelector
        options={FORM_TYPES}
        value={typeChoice(form)}
        onChange={(t) => {
          const investment = t === 'investment' || t === 'withdraw'
          set('type', investment ? 'investment' : t)
          set('outflow', t === 'withdraw')
          if (investment && investmentCategoryId !== null) set('categoryId', investmentCategoryId)
        }}
      />
      <TypeHintLine hint={typeHint(form)} />
    </>
  )
}

export function CategoryAccountRow({
  form,
  set,
  model,
  investmentCategoryId,
}: {
  form: FormFields
  set: Setter
  model: ExpenseModel
  /** The investments category; an investment row is locked to it. */
  investmentCategoryId: number | null
}) {
  const lockedCategoryId = form.type === 'investment' ? investmentCategoryId : null
  const categories = selectableOptions(model.dataset.categories, form.categoryId, 'Pick a category')
  const accounts = selectableOptions(model.dataset.accounts, form.accountId, 'Pick an account')
  const selectedCategory = model.dataset.categories.find((c) => c.id === form.categoryId)
  const categoryInactive = selectedCategory != null && !selectedCategory.active
  const selectedAccount = model.dataset.accounts.find((a) => a.id === form.accountId)
  const accountInactive = selectedAccount != null && !selectedAccount.active
  return (
    <div className={styles.row}>
      <div className={styles.fieldStack}>
        <Field label="Category">
          <select
            value={form.categoryId}
            disabled={lockedCategoryId !== null}
            onChange={(e) => set('categoryId', Number(e.target.value))}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {optionLabel(c)}
              </option>
            ))}
          </select>
        </Field>
        {lockedCategoryId !== null ? (
          <p className={styles.fieldHint}>Investments always go here; change it under Settings.</p>
        ) : null}
        {categoryInactive ? <p className={styles.inactiveWarning}>This category is inactive</p> : null}
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
        {accountInactive ? <p className={styles.inactiveWarning}>This account is inactive</p> : null}
      </div>
    </div>
  )
}

export function DateBudgetRow({
  form,
  set,
  onDate,
  onTrapPausedChange,
}: {
  form: FormFields
  set: Setter
  onDate: (value: string) => void
  onTrapPausedChange?: ((paused: boolean) => void) | undefined
}) {
  return (
    <div className={styles.row}>
      <Field label="Date" as="div">
        <DateInput value={form.date} ariaLabel="Date" onChange={onDate} onTrapPausedChange={onTrapPausedChange} />
      </Field>
      <Field label="Budget month" as="div">
        <MonthInput
          value={form.budgetMonth}
          ariaLabel="Budget month"
          onChange={(value) => set('budgetMonth', value)}
          onTrapPausedChange={onTrapPausedChange}
        />
      </Field>
    </div>
  )
}
