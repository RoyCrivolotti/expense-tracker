import type { RefObject } from 'react'
import type { TransactionAttachment } from '../../types'
import type { PendingReceipt } from '../../data/pendingReceipts'
import { CameraIcon, TrashIcon } from '../icons'
import { RECEIPT_CLIENT_POLICY } from '../../data/receiptClientPolicy'
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

export function StoredThumb({
  attachment,
  busy,
  onView,
  onRemove,
}: {
  attachment: TransactionAttachment
  busy: boolean
  onView: () => void
  onRemove: () => void
}) {
  return (
    <div className={styles.item}>
      <button
        type="button"
        className={styles.thumb}
        onClick={onView}
        aria-label={`View ${attachment.originalName ?? 'receipt'}`}
      >
        {attachment.hasThumb ? (
          <img src={`/api/expenses/attachments/${attachment.id}?variant=thumb`} alt="" loading="lazy" />
        ) : (
          <span className={styles.doc}>PDF</span>
        )}
      </button>
      <button
        type="button"
        className={styles.removeBtn}
        disabled={busy}
        onClick={onRemove}
        aria-label={`Remove ${attachment.originalName ?? 'receipt'}`}
      >
        <TrashIcon />
      </button>
    </div>
  )
}

export function PendingThumb({
  file,
  url,
  busy,
  onRemove,
}: {
  file: File
  url: string | undefined
  busy: boolean
  onRemove: () => void
}) {
  return (
    <div className={`${styles.item} ${styles.pending}`}>
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
        onClick={onRemove}
        aria-label={`Remove ${file.name}`}
      >
        <TrashIcon />
      </button>
    </div>
  )
}

export function AddButton({ busy, atCap, onClick }: { busy: boolean; atCap: boolean; onClick: () => void }) {
  const label = busy ? 'Adding…' : atCap ? 'Receipt limit reached' : 'Add receipt'
  return (
    <button type="button" className={styles.addBtn} disabled={busy || atCap} onClick={onClick}>
      <span className={styles.addIcon} aria-hidden>
        <CameraIcon />
      </span>
      {label}
    </button>
  )
}

interface ItemsProps {
  attachments: TransactionAttachment[]
  pendingFiles: PendingReceipt[]
  busy: boolean
  hideControls: boolean
  setOverlay: (
    next: TransactionAttachment | null,
    kind: 'view' | 'remove',
  ) => void
  unstage: (index: number) => void
  onAdd: () => void
}

/** The stored thumbnails, the staged ones, and the add button when the strip draws its own controls. */
export function ReceiptItems({
  attachments,
  pendingFiles,
  busy,
  hideControls,
  setOverlay,
  unstage,
  onAdd,
}: ItemsProps) {
  const atCap = attachments.length + pendingFiles.length >= RECEIPT_CLIENT_POLICY.maxPerTransaction
  return (
    <div className={styles.items}>
      {attachments.map((a) => (
        <StoredThumb
          key={a.id}
          attachment={a}
          busy={busy}
          onView={() => setOverlay(a, 'view')}
          onRemove={() => setOverlay(a, 'remove')}
        />
      ))}
      {pendingFiles.map(({ file, url }, index) => (
        <PendingThumb
          key={url || `${file.name}-${index}`}
          file={file}
          url={url}
          busy={busy}
          onRemove={() => unstage(index)}
        />
      ))}
      {!hideControls && <AddButton busy={busy} atCap={atCap} onClick={onAdd} />}
    </div>
  )
}

export function ReceiptFileInput({
  inputRef,
  onFiles,
}: {
  inputRef: RefObject<HTMLInputElement | null>
  onFiles: (files: FileList | null) => void
}) {
  return (
    <input
      ref={inputRef}
      type="file"
      className={styles.fileInput}
      accept={ACCEPT}
      multiple
      onChange={(e) => onFiles(e.target.files)}
    />
  )
}

/** The error line, and the note that staged receipts go up with the save. */
export function ReceiptMessages({ error, showHint }: { error: string | null; showHint: boolean }) {
  return (
    <>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {showHint ? <p className={styles.hint}>Uploaded when you save.</p> : null}
    </>
  )
}
