import { useState } from 'react'
import type { Transaction } from '../../types'
import type { NewTransaction } from '../../data/dataSource'
import { parseEuroToCents } from '../../engine/money'
import type { ExpenseModel } from '../useExpenseData'
import type { TransactionSeed } from '../actions'
import { Fields } from './TransactionFields'
import { initialFields, type FormFields, type Setter } from './transactionFormState'
import { acceptDescriptionSuggestion } from './transactionFormActions'
import { InstallmentStep } from './InstallmentStep'
import {
  buildInstallmentIntent,
  type InstallmentDraft,
  type InstallmentIntent,
} from './installmentIntent'
import styles from './TransactionForm.module.css'

interface FormProps {
  model: ExpenseModel
  editing: Transaction | null
  seed?: TransactionSeed | undefined
  onSubmit: (input: NewTransaction, id?: number, intent?: InstallmentIntent) => Promise<void>
  onDelete?: ((id: number) => Promise<void>) | undefined
  onDuplicate?: ((txn: Transaction) => void) | undefined
  onClose: () => void
}

function toInput(form: FormFields, cents: number, editing: Transaction | null): NewTransaction {
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
  }
}

function initialDraft(
  editing: Transaction | null,
  model: ExpenseModel,
  seed?: TransactionSeed,
): InstallmentDraft {
  if (!editing && seed?.planId != null) {
    const plan = model.lookup.installmentPlan(seed.planId)
    return {
      mode: 'existing',
      planId: seed.planId,
      totalCount: plan ? String(plan.totalCount) : '',
      installmentIndex: seed.installmentIndex != null ? String(seed.installmentIndex) : '',
    }
  }
  return { mode: 'none', totalCount: '', installmentIndex: '', planId: null }
}

/** Label for the installment toggle reflecting the pending draft, then current link. */
function linkLabel(draft: InstallmentDraft, editing: Transaction | null, model: ExpenseModel): string {
  if (draft.mode === 'new') {
    return `New plan - payment ${draft.installmentIndex || '?'}/${draft.totalCount || '?'}`
  }
  if (draft.mode === 'existing') {
    const plan = draft.planId != null ? model.lookup.installmentPlan(draft.planId) : undefined
    return plan
      ? `${plan.description} - payment ${draft.installmentIndex || '?'}/${plan.totalCount}`
      : 'Existing plan'
  }
  if (draft.mode === 'unlink') return 'Will be removed from plan'
  if (editing?.planId != null) {
    const plan = model.lookup.installmentPlan(editing.planId)
    return plan
      ? `Installment ${editing.installmentIndex}/${plan.totalCount} - ${plan.description}`
      : 'Part of a plan'
  }
  return 'Not part of a plan'
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
  const [draft, setDraft] = useState<InstallmentDraft>(() => initialDraft(editing, model, seed))
  const [view, setView] = useState<'fields' | 'installment'>('fields')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const set: Setter = (key, value) => setForm((f) => ({ ...f, [key]: value }))
  const setDraftField: <K extends keyof InstallmentDraft>(key: K, value: InstallmentDraft[K]) => void =
    (key, value) => setDraft((d) => ({ ...d, [key]: value }))

  const submit = async () => {
    const cents = Math.abs(parseEuroToCents(form.amount))
    if (cents <= 0) {
      setErr('Enter an amount greater than zero')
      return
    }
    const intent = buildInstallmentIntent(draft)
    if (!intent.ok) {
      setErr(intent.error)
      setView('installment')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      await onSubmit(toInput(form, cents, editing), editing?.id, intent.intent)
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
      {view === 'installment' ? (
        <InstallmentStep
          model={model}
          editing={editing}
          draft={draft}
          set={setDraftField}
          onBack={() => setView('fields')}
          error={err}
        />
      ) : (
        <>
          <Fields
            form={form}
            set={set}
            model={model}
            editing={editing}
            onAcceptSuggestion={(s) => acceptDescriptionSuggestion(s, model, setForm)}
          />
          <button
            type="button"
            className={styles.linkButton}
            onClick={() => setView('installment')}
          >
            Installment plan: {linkLabel(draft, editing, model)}
          </button>
          {err && <p className={styles.error}>{err}</p>}
        </>
      )}
      <div className={styles.actions}>
        {view === 'fields' && editing && onDelete && (
          <button
            type="button"
            className={styles.delete}
            disabled={busy}
            onClick={() => void onDelete(editing.id).then(onClose)}
          >
            Delete
          </button>
        )}
        {view === 'fields' && editing && onDuplicate && (
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
