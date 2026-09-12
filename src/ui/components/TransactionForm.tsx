import { useEffect, useRef, useState } from 'react'
import type { Transaction } from '../../types'
import type { NewTransaction } from '../../data/dataSource'
import { parseMoneyToCents } from '../../engine/money'
import {
  revokeStaged,
  type PendingReceipt,
} from '../../data/pendingReceipts'
import { useToast } from '../hooks/useToast'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import type { ExpenseModel } from '../useExpenseData'
import type { ExpenseActions } from '../actions'
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
  /** Resolves with the stored row on create, null on update (the id was known). */
  onSubmit: (
    input: NewTransaction,
    id?: number,
    intent?: InstallmentIntent,
  ) => Promise<Transaction | null>
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
  /** Passed through to the receipts strip; absent in read-only sessions. */
  actions?: ExpenseActions | undefined
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

/**
 * The button carries the upload progress because the uploads happen *after* the
 * save: three phone photos is several seconds of a modal that would otherwise
 * sit on "Saving…" with nothing moving.
 */
function saveLabel({
  busy,
  uploading,
  editing,
  retrying,
}: {
  busy: boolean
  uploading: { done: number; total: number } | null
  editing: Transaction | null
  retrying: boolean
}): string {
  if (uploading) return `Uploading receipt ${uploading.done + 1} of ${uploading.total}…`
  if (retrying) return busy ? 'Retrying…' : 'Retry receipts'
  if (busy) return 'Saving…'
  return editing ? 'Save changes' : 'Add transaction'
}

function uploadFailureMessage(count: number): string {
  const noun = count === 1 ? 'receipt' : 'receipts'
  return `The transaction was saved, but ${count} ${noun} could not be uploaded. Try again, or remove them and attach later.`
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
  actions,
}: FormProps) {
  const format = useMoneyFormat()
  const { showToast } = useToast()
  const [form, setForm] = useState<FormFields>(() => initialFields(editing, model, format, seed))
  const [draft, setDraft] = useState<InstallmentDraft>(() => initialDraft(editing, model, seed))
  const [view, setView] = useState<'fields' | 'installment'>('fields')
  const [busy, setBusy] = useState(false)
  // Owned here, not in ReceiptStrip: the id these upload against is only known
  // in `submit` below, and there is no channel back up from the strip.
  const [pendingFiles, setPendingFiles] = useState<PendingReceipt[]>([])
  // Set once a create succeeds but its uploads did not, so the strip can switch
  // to live mode and the user retries in place instead of hunting for the row.
  const [savedId, setSavedId] = useState<number | null>(null)
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  // Ref, not state: only ever needs its first-render value, and re-rendering to
  // update it would be pointless — nothing should ever change what "opening state" means.
  const initialSnapshot = useRef({ form, draft })
  useEffect(() => {
    const dirty =
      JSON.stringify(form) !== JSON.stringify(initialSnapshot.current.form) ||
      JSON.stringify(draft) !== JSON.stringify(initialSnapshot.current.draft)
    // Staged receipts count as unsaved input. Without them, attaching three
    // photos and changing nothing else left `dirty` false, so closing skipped
    // the confirm sheet and dropped them silently.
    onDirtyChange?.(dirty || pendingFiles.length > 0)
    // onDirtyChange intentionally omitted: callers pass a state setter inline, which
    // would otherwise re-run this on every parent render regardless of form/draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, draft, pendingFiles])
  // Mirrored into a ref so the unmount cleanup can release the staged blobs
  // without listing `pendingFiles` as a dependency — which would revoke them on
  // every change instead of once at the end. Assigned in an effect, not render.
  const stagedRef = useRef<PendingReceipt[]>([])
  useEffect(() => {
    stagedRef.current = pendingFiles
  }, [pendingFiles])
  useEffect(() => {
    return () => revokeStaged(stagedRef.current)
  }, [])

  const set: Setter = (key, value) => setForm((f) => ({ ...f, [key]: value }))
  const setDraftField: <K extends keyof InstallmentDraft>(key: K, value: InstallmentDraft[K]) => void =
    (key, value) => setDraft((d) => ({ ...d, [key]: value }))

  /**
   * Upload the staged receipts against a now-existing row, one at a time — the
   * server checks the per-transaction cap and the storage quota per request, so
   * parallel uploads would race past both. Returns the files that did not make
   * it, so they stay staged for a retry rather than vanishing.
   */
  const flushPending = async (
    id: number,
    staged: PendingReceipt[],
  ): Promise<PendingReceipt[]> => {
    if (!actions || staged.length === 0) return []
    const failed: PendingReceipt[] = []
    for (const [index, item] of staged.entries()) {
      setUploading({ done: index, total: staged.length })
      try {
        await actions.uploadAttachment(id, item.file)
        // Uploaded: its blob is no longer previewing anything.
        revokeStaged([item])
      } catch {
        failed.push(item)
      }
    }
    setUploading(null)
    return failed
  }

  /** A failed flush leaves the row saved; only the receipts still need retrying. */
  const retryReceipts = async (id: number) => {
    setBusy(true)
    setErr(null)
    const failed = await flushPending(id, pendingFiles)
    setPendingFiles(failed)
    if (failed.length > 0) {
      setErr(uploadFailureMessage(failed.length))
      setBusy(false)
      return
    }
    showToast('Receipts uploaded', 'success')
    onClose()
  }

  /** Validate, or surface the first problem and say which view owns it. */
  const validate = (): { cents: number; intent: InstallmentIntent | undefined } | null => {
    const cents = Math.abs(parseMoneyToCents(form.amount, format))
    if (cents <= 0) {
      setErr('Enter an amount greater than zero')
      return null
    }
    const intent = buildInstallmentIntent(draft)
    if (!intent.ok) {
      setErr(intent.error)
      setView('installment')
      return null
    }
    return { cents, intent: intent.intent }
  }

  /** Everything after the row itself is stored. Never re-creates the row. */
  const afterSave = async (id: number | null) => {
    const failed = id == null ? pendingFiles : await flushPending(id, pendingFiles)
    setPendingFiles(failed)
    if (failed.length === 0) {
      showToast(editing ? 'Transaction updated' : 'Transaction added', 'success')
      onClose()
      return
    }
    // The transaction is saved; only its receipts are not. Staying open with the
    // strip pointed at the new id lets the user retry in place rather than
    // hunting for the row — and a toast could not carry this, since the one
    // toast slot holds a message for 2.5s and the next replaces it.
    if (id != null) setSavedId(id)
    setErr(uploadFailureMessage(failed.length))
    setBusy(false)
  }

  const submit = async () => {
    // The row already exists: this press is retrying its receipts, and going
    // through onSubmit again would create a second transaction.
    if (savedId != null) {
      await retryReceipts(savedId)
      return
    }
    const valid = validate()
    if (!valid) return
    setBusy(true)
    setErr(null)
    try {
      const saved = await onSubmit(toInput(form, valid.cents, editing), editing?.id, valid.intent)
      await afterSave(saved?.id ?? editing?.id ?? null)
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
            actions={actions}
            receiptTargetId={editing?.id ?? savedId}
            pendingFiles={pendingFiles}
            onPendingChange={setPendingFiles}
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
          {saveLabel({ busy, uploading, editing, retrying: savedId != null })}
        </button>
      </div>
    </form>
  )
}
