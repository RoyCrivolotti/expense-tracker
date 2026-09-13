import { useEffect, useRef, useState } from 'react'
import type { Transaction } from '../../types'
import type { NewTransaction } from '../../data/dataSource'
import { parseMoneyToCents } from '../../engine/money'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
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
  /** Kept mounted but visually hidden (e.g. while the batch-entry tab is active),
   * so its own state survives switching back rather than losing what was typed. */
  hidden?: boolean
  /** Reports whether the form has diverged from its opening state, so a caller
   * can warn before discarding it (e.g. closing the modal without saving). */
  onDirtyChange?: (dirty: boolean) => void
  /** Raised while a portalled popover owns focus, so the Modal pauses its trap. */
  onTrapPausedChange?: ((paused: boolean) => void) | undefined
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
    // Always sent, including as null — on edit that is how the flag is cleared,
    // and an absent key would leave the old one in place.
    flagId: form.flagId,
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
  return { mode: 'none', totalCount: '', installmentIndex: '', planId: null, splitTotal: false }
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
  hidden,
  onDirtyChange,
  onTrapPausedChange,
}: FormProps) {
  const format = useMoneyFormat()
  const [form, setForm] = useState<FormFields>(() => initialFields(editing, model, format, seed))
  const [draft, setDraft] = useState<InstallmentDraft>(() => initialDraft(editing, model, seed))
  const [view, setView] = useState<'fields' | 'installment'>('fields')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // Ref, not state: only ever needs its first-render value, and re-rendering to
  // update it would be pointless — nothing should ever change what "opening state" means.
  const initialSnapshot = useRef({ form, draft })
  useEffect(() => {
    const dirty =
      JSON.stringify(form) !== JSON.stringify(initialSnapshot.current.form) ||
      JSON.stringify(draft) !== JSON.stringify(initialSnapshot.current.draft)
    onDirtyChange?.(dirty)
    // onDirtyChange intentionally omitted: callers pass a state setter inline, which
    // would otherwise re-run this on every parent render regardless of form/draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, draft])
  const set: Setter = (key, value) => setForm((f) => ({ ...f, [key]: value }))
  const setDraftField: <K extends keyof InstallmentDraft>(key: K, value: InstallmentDraft[K]) => void =
    (key, value) => setDraft((d) => ({ ...d, [key]: value }))

  const submit = async () => {
    const cents = Math.abs(parseMoneyToCents(form.amount, format))
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
      hidden={hidden}
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
          amountCents={Math.abs(parseMoneyToCents(form.amount, format) || 0)}
        />
      ) : (
        <>
          <Fields
            form={form}
            set={set}
            model={model}
            editing={editing}
            onAcceptSuggestion={(s) => acceptDescriptionSuggestion(s, model, setForm)}
            onTrapPausedChange={onTrapPausedChange}
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
