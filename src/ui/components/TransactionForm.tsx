import { useState } from 'react'
import type { Transaction } from '../../types'
import type { NewTransaction } from '../../data/dataSource'
import { parseEuroToCents } from '../../engine/money'
import type { ExpenseModel } from '../useExpenseData'
import type { TransactionSeed } from '../actions'
import { Fields } from './TransactionFields'
import { initialFields, type FormFields, type Setter } from './transactionFormState'
import { acceptDescriptionSuggestion } from './transactionFormActions'
import styles from './TransactionForm.module.css'

interface FormProps {
  model: ExpenseModel
  editing: Transaction | null
  seed?: TransactionSeed | undefined
  onSubmit: (input: NewTransaction, id?: number) => Promise<void>
  onDelete?: ((id: number) => Promise<void>) | undefined
  onDuplicate?: ((txn: Transaction) => void) | undefined
  onClose: () => void
}

function toInput(
  form: FormFields,
  cents: number,
  editing: Transaction | null,
  seed: TransactionSeed | undefined,
): NewTransaction {
  return {
    date: form.date,
    budgetMonth: form.budgetMonth,
    description: form.description,
    accountId: form.accountId,
    categoryId: form.categoryId,
    type: form.type,
    amountCents: cents,
    cancelled: editing?.cancelled ?? false,
    ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
    // Plan link only applies to fresh installment payments, never edits or duplicates.
    ...(!editing && seed?.planId != null ? { planId: seed.planId } : {}),
  }
}

export function TransactionForm({
  model,
  editing,
  seed,
  onSubmit,
  onDelete,
  onDuplicate,
  onClose,
}: FormProps) {
  const [form, setForm] = useState<FormFields>(() => initialFields(editing, model, seed))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const set: Setter = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const submit = async () => {
    const cents = Math.abs(parseEuroToCents(form.amount))
    if (cents <= 0) {
      setErr('Enter an amount greater than zero')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      await onSubmit(toInput(form, cents, editing, seed), editing?.id)
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save')
      setBusy(false)
    }
  }

  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <Fields
        form={form}
        set={set}
        model={model}
        editing={editing}
        onAcceptSuggestion={(s) => acceptDescriptionSuggestion(s, model, setForm)}
      />
      {err && <p className={styles.error}>{err}</p>}
      <div className={styles.actions}>
        {editing && onDelete && (
          <button
            type="button"
            className={styles.delete}
            disabled={busy}
            onClick={() => void onDelete(editing.id).then(onClose)}
          >
            Delete
          </button>
        )}
        {editing && onDuplicate && (
          <button
            type="button"
            className={styles.secondary}
            disabled={busy}
            onClick={() => onDuplicate(editing)}
          >
            Duplicate
          </button>
        )}
        <button type="submit" className={`${styles.save} tapActive`} disabled={busy}>
          {busy ? 'Saving…' : editing ? 'Save changes' : 'Add transaction'}
        </button>
      </div>
    </form>
  )
}
