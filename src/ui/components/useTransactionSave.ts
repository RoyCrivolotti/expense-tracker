import { useEffect, useRef, useState } from 'react'
import type { Transaction } from '../../types'
import type { NewTransaction } from '../../data/dataSource'
import type { MoneyFormat } from '../../engine/money'
import { revokeStaged, type PendingReceipt } from '../../data/pendingReceipts'
import type { ToastApi } from '../hooks/useToast'
import type { ExpenseActions } from '../actions'
import type { FormFields } from './transactionFormState'
import type { InstallmentDraft, InstallmentIntent } from './installmentIntent'
import {
  flushPending,
  initialLabelIds,
  saveLabelsIfChanged,
  savedOrEditing,
  toInput,
  uploadFailureMessage,
  validateForm,
} from './transactionFormSupport'

export interface SaveArgs {
  editing: Transaction | null
  form: FormFields
  draft: InstallmentDraft
  format: MoneyFormat
  showToast: ToastApi['showToast']
  actions?: ExpenseActions | undefined
  onSubmit: (
    input: NewTransaction,
    id?: number,
    intent?: InstallmentIntent,
  ) => Promise<Transaction | null>
  onClose: () => void
  onViewChange: (view: 'fields' | 'installment') => void
}

export interface SaveFlow {
  busy: boolean
  pendingFiles: PendingReceipt[]
  setPendingFiles: (files: PendingReceipt[]) => void
  savedId: number | null
  uploading: { done: number; total: number } | null
  err: string | null
  submit: () => Promise<void>
}

/** The save button's whole round trip: validate, store the row, labels, then receipts. */
export function useTransactionSave(args: SaveArgs): SaveFlow {
  const { editing, form, draft, format, showToast, actions, onSubmit, onClose, onViewChange } = args
  const [busy, setBusy] = useState(false)
  // Owned here, not in ReceiptStrip: the id these upload against is only known
  // in `submit` below, and there is no channel back up from the strip.
  const [pendingFiles, setPendingFiles] = useState<PendingReceipt[]>([])
  // Set once a create succeeds but its uploads did not, so the strip can switch
  // to live mode and the user retries in place instead of hunting for the row.
  const [savedId, setSavedId] = useState<number | null>(null)
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  /**
   * The label set actually confirmed on the server for this session, advanced after
   * each successful save rather than read from `editing?.labelIds` directly. `editing`
   * itself never changes while the form is open (see ExpensesApp's `modal.txn`), so once
   * a "Save and retry" round trips one save, comparing the next press against the
   * original `editing.labelIds` compares against a value the server has already moved
   * past — a second edit made only to the labels, right before that retry, then reads as
   * "unchanged" and never reaches setTransactionLabels at all.
   */
  const lastSavedLabelIds = useRef(initialLabelIds(editing))

  /** Everything after the row itself is stored. Never re-creates the row. */
  const afterSave = async (id: number | null) => {
    const { failed, reason } =
      id == null ? { failed: pendingFiles, reason: null } : await flushPending(actions, setUploading, id, pendingFiles)
    setPendingFiles(failed)
    if (failed.length === 0) {
      showToast(savedOrEditing(editing, savedId), 'success')
      onClose()
      return
    }
    // The transaction is saved; only its receipts are not. Staying open with the
    // strip pointed at the new id lets the user retry in place rather than
    // hunting for the row — and a toast could not carry this, since the one
    // toast slot holds a message for 2.5s and the next replaces it.
    if (id != null) setSavedId(id)
    setErr(uploadFailureMessage(failed.length, reason))
    setBusy(false)
  }

  const submit = async () => {
    const valid = validateForm(form, draft, format, setErr, onViewChange)
    if (!valid) return
    setBusy(true)
    setErr(null)
    try {
      // `savedId` means a previous press created the row and only its receipts
      // failed. Send that id so this becomes an update: going through the create
      // path again would make a second transaction, and skipping onSubmit
      // entirely would silently discard any field the user corrected meanwhile.
      const targetId = savedId ?? editing?.id
      // The plan intent was already applied on the first press; re-sending it
      // would create a second installment plan alongside the first.
      const intent = savedId != null ? undefined : valid.intent
      const saved = await onSubmit(toInput(form, valid.cents, editing), targetId, intent)
      const savedTxnId = saved?.id ?? targetId ?? null
      const labelsError = await saveLabelsIfChanged(
        actions,
        savedTxnId,
        form.labelIds,
        lastSavedLabelIds.current,
        (saved) => {
          lastSavedLabelIds.current = saved
        },
      )
      await afterSave(savedTxnId)
      // After afterSave's own toast, not before: the toast has one slot, and the
      // transaction-saved message would otherwise overwrite this one immediately.
      if (labelsError) showToast(`Transaction saved, but labels were not: ${labelsError}`, 'error')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save')
      setBusy(false)
    }
  }

  return { busy, pendingFiles, setPendingFiles, savedId, uploading, err, submit }
}

/**
 * Reports whether the form has moved off its opening state, and how many receipts
 * are at risk after a partial save, to the caller guarding the close.
 */
export function useDirtyReporting(
  form: FormFields,
  draft: InstallmentDraft,
  pendingFiles: PendingReceipt[],
  savedId: number | null,
  onDirtyChange: ((dirty: boolean) => void) | undefined,
  onPartialSaveChange: ((strandedReceipts: number) => void) | undefined,
): void {
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
    // Distinct from dirty: past a partial save the transaction is safe and only
    // the receipts are at risk, which needs different words on the way out.
    onPartialSaveChange?.(savedId != null ? pendingFiles.length : 0)
    // onDirtyChange intentionally omitted: callers pass a state setter inline, which
    // would otherwise re-run this on every parent render regardless of form/draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, draft, pendingFiles, savedId])
}

/** Releases the staged receipt blobs once, when the form goes away. */
export function useRevokeStagedOnUnmount(pendingFiles: PendingReceipt[]): void {
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
}
