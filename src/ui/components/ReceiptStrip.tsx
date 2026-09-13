import { useRef, useState } from 'react'
import type { TransactionAttachment } from '../../types'
import { RECEIPT_CLIENT_POLICY } from '../../data/receiptClientPolicy'
import {
  removeStaged,
  stageReceipts,
  type PendingReceipt,
} from '../../data/pendingReceipts'
import type { ExpenseActions } from '../actions'
import { CameraIcon, TrashIcon } from '../icons'
import { ConfirmSheet } from './ConfirmSheet'
import { ReceiptViewer } from './ReceiptViewer'
import styles from './ReceiptStrip.module.css'

/**
 * Listing concrete types rather than `image/*` keeps HEIC out of the picker on
 * iOS — the server rejects it anyway, and being told after choosing is worse
 * than not seeing it.
 *
 * Deliberately no `capture` attribute. It reads as a harmless hint, but on iOS
 * Safari and Chrome Android it opens the camera *directly* and makes `multiple`
 * inert — so the emailed PDF invoice and the photo you took last week, both of
 * which this feature exists to collect, become unreachable on a phone. Without
 * it the OS sheet offers Camera, Photo Library and Files, which is a superset.
 */
const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf'

const NO_PENDING: PendingReceipt[] = []

interface Props {
  /** Absent on the add form: the transaction does not exist yet. */
  transactionId?: number | undefined
  attachments: TransactionAttachment[]
  actions: ExpenseActions
  /**
   * Files chosen before the transaction exists. Held by the enclosing form, not
   * here, because the id they will be uploaded against is only known in its
   * submit handler — two levels above this component, with no channel back up.
   */
  pendingFiles?: PendingReceipt[]
  onPendingChange?: ((files: PendingReceipt[]) => void) | undefined
  /** Lets an enclosing Modal pause its focus trap while the viewer is open. */
  onTrapPausedChange?: ((paused: boolean) => void) | undefined
}

export function ReceiptStrip({
  transactionId,
  attachments,
  actions,
  pendingFiles = NO_PENDING,
  onPendingChange,
  onTrapPausedChange,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [viewing, setViewing] = useState<TransactionAttachment | null>(null)
  const [removing, setRemoving] = useState<TransactionAttachment | null>(null)
  const total = attachments.length + pendingFiles.length
  const atCap = total >= RECEIPT_CLIENT_POLICY.maxPerTransaction

  const setOverlay = (next: TransactionAttachment | null, kind: 'view' | 'remove') => {
    if (kind === 'view') setViewing(next)
    else setRemoving(next)
    onTrapPausedChange?.(next !== null)
  }

  /** Reject at the cap here too: the server would, but only after the upload. */
  const withinCap = (chosen: File[]): File[] => {
    const room = Math.max(0, RECEIPT_CLIENT_POLICY.maxPerTransaction - total)
    if (chosen.length <= room) return chosen
    // Naming the number dropped, not just the policy: silently keeping four of
    // six and reporting the limit reads as though everything was accepted.
    const dropped = chosen.length - room
    setErr(
      `Only ${RECEIPT_CLIENT_POLICY.maxPerTransaction} receipts fit — ${dropped} ${
        dropped === 1 ? 'was' : 'were'
      } not added.`,
    )
    return chosen.slice(0, room)
  }

  const add = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setErr(null)
    const chosen = withinCap(Array.from(files))
    if (inputRef.current) inputRef.current.value = ''
    if (chosen.length === 0) return

    // No transaction yet: stage the files and let the form upload them once it
    // has an id. Uploading eagerly would need a row to hang them off.
    if (transactionId == null) {
      onPendingChange?.([...pendingFiles, ...stageReceipts(chosen)])
      return
    }

    setBusy(true)
    try {
      // Sequential on purpose: the server checks the per-transaction cap and the
      // storage quota per request, and parallel uploads would race past both.
      for (const file of chosen) {
        await actions.uploadAttachment(transactionId, file)
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not add the receipt')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (attachment: TransactionAttachment) => {
    setOverlay(null, 'remove')
    setBusy(true)
    setErr(null)
    try {
      await actions.deleteAttachment(attachment.id)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not remove the receipt')
    } finally {
      setBusy(false)
    }
  }

  const unstage = (index: number) => {
    setErr(null)
    onPendingChange?.(removeStaged(pendingFiles, index))
  }

  return (
    <div className={styles.strip}>
      <span className={styles.label}>Receipts</span>
      <div className={styles.items}>
        {attachments.map((attachment) => (
          <div key={attachment.id} className={styles.item}>
            <button
              type="button"
              className={styles.thumb}
              onClick={() => setOverlay(attachment, 'view')}
              aria-label={`View ${attachment.originalName ?? 'receipt'}`}
            >
              {attachment.hasThumb ? (
                <img
                  src={`/api/expenses/attachments/${attachment.id}?variant=thumb`}
                  alt=""
                  loading="lazy"
                />
              ) : (
                <span className={styles.doc}>PDF</span>
              )}
            </button>
            <button
              type="button"
              className={styles.removeBtn}
              disabled={busy}
              onClick={() => setOverlay(attachment, 'remove')}
              aria-label={`Remove ${attachment.originalName ?? 'receipt'}`}
            >
              <TrashIcon />
            </button>
          </div>
        ))}

        {pendingFiles.map(({ file, url }, index) => (
          <div key={url || `${file.name}-${index}`} className={`${styles.item} ${styles.pending}`}>
            {/* A button, like a stored receipt: you attach a photo precisely to
                check you shot the right receipt, and a span cannot be opened. */}
            <a
              className={styles.thumb}
              href={url || undefined}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open ${file.name}`}
            >
              {file.type === 'application/pdf' || !url ? (
                <span className={styles.doc}>{file.type === 'application/pdf' ? 'PDF' : 'IMG'}</span>
              ) : (
                <img src={url} alt="" />
              )}
            </a>
            <button
              type="button"
              className={styles.removeBtn}
              disabled={busy}
              onClick={() => unstage(index)}
              aria-label={`Remove ${file.name}`}
            >
              <TrashIcon />
            </button>
          </div>
        ))}

        <button
          type="button"
          className={styles.addBtn}
          disabled={busy || atCap}
          onClick={() => inputRef.current?.click()}
        >
          <span className={styles.addIcon} aria-hidden>
            <CameraIcon />
          </span>
          {busy ? 'Adding…' : atCap ? 'Receipt limit reached' : 'Add receipt'}
        </button>
        <input
          ref={inputRef}
          type="file"
          className={styles.fileInput}
          accept={ACCEPT}
          multiple
          onChange={(e) => void add(e.target.files)}
        />
      </div>

      {/*
        role=alert, not a toast: the toast slot holds one message for 2.5s and a
        later one replaces it, so "Transaction added" would swallow this. An
        alert inserted together with its text is the one live-region shape
        screen readers announce reliably.
      */}
      {err ? (
        <p className={styles.error} role="alert">
          {err}
        </p>
      ) : null}
      {transactionId == null && pendingFiles.length > 0 ? (
        <p className={styles.hint}>Uploaded when you save.</p>
      ) : null}

      {viewing ? (
        <ReceiptViewer attachment={viewing} onClose={() => setOverlay(null, 'view')} />
      ) : null}
      {removing ? (
        <ConfirmSheet
          title="Remove this receipt?"
          message="The file is deleted permanently. The transaction itself is unchanged."
          confirmLabel="Remove"
          destructive
          onConfirm={() => void remove(removing)}
          onCancel={() => setOverlay(null, 'remove')}
        />
      ) : null}
    </div>
  )
}
