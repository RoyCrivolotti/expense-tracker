import { useRef, useState } from 'react'
import type { TransactionAttachment } from '../../types'
import type { ExpenseActions } from '../actions'
import { CameraIcon, TrashIcon } from '../icons'
import { ConfirmSheet } from './ConfirmSheet'
import { ReceiptViewer } from './ReceiptViewer'
import styles from './ReceiptStrip.module.css'

/**
 * Browsers offer the camera directly for `capture`, and listing the concrete
 * types rather than `image/*` keeps HEIC out of the picker on iOS — the server
 * rejects it anyway, and being told after choosing is worse than not seeing it.
 */
const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf'

interface Props {
  transactionId: number
  attachments: TransactionAttachment[]
  actions: ExpenseActions
  /** Lets an enclosing Modal pause its focus trap while the viewer is open. */
  onTrapPausedChange?: ((paused: boolean) => void) | undefined
}

export function ReceiptStrip({
  transactionId,
  attachments,
  actions,
  onTrapPausedChange,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [viewing, setViewing] = useState<TransactionAttachment | null>(null)
  const [removing, setRemoving] = useState<TransactionAttachment | null>(null)

  const setOverlay = (next: TransactionAttachment | null, kind: 'view' | 'remove') => {
    if (kind === 'view') setViewing(next)
    else setRemoving(next)
    onTrapPausedChange?.(next !== null)
  }

  const add = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setBusy(true)
    setErr(null)
    try {
      // Sequential on purpose: the server checks the per-transaction cap and the
      // storage quota per request, and parallel uploads would race past both.
      for (const file of Array.from(files)) {
        await actions.uploadAttachment(transactionId, file)
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not add the receipt')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const remove = async (attachment: TransactionAttachment) => {
    setOverlay(null, 'remove')
    setBusy(true)
    try {
      await actions.deleteAttachment(attachment.id)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not remove the receipt')
    } finally {
      setBusy(false)
    }
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

        <button
          type="button"
          className={styles.addBtn}
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          <span className={styles.addIcon} aria-hidden>
            <CameraIcon />
          </span>
          {busy ? 'Adding…' : 'Add receipt'}
        </button>
        <input
          ref={inputRef}
          type="file"
          className={styles.fileInput}
          accept={ACCEPT}
          capture="environment"
          multiple
          onChange={(e) => void add(e.target.files)}
        />
      </div>

      {err ? <p className={styles.error}>{err}</p> : null}

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
