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
import { EXIT_MS } from '../hooks/motion'
import { ConfirmSheet } from './ConfirmSheet'
import { Presence, PresenceValue } from './Presence'
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

function errText(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback
}

function capFilter(chosen: File[], total: number): { kept: File[]; error: string | null } {
  const room = Math.max(0, RECEIPT_CLIENT_POLICY.maxPerTransaction - total)
  if (chosen.length <= room) return { kept: chosen, error: null }
  const dropped = chosen.length - room
  return {
    kept: chosen.slice(0, room),
    error: `Only ${RECEIPT_CLIENT_POLICY.maxPerTransaction} receipts fit — ${dropped} ${
      dropped === 1 ? 'was' : 'were'
    } not added.`,
  }
}

function StoredThumb({
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
        onClick={onRemove}
        aria-label={`Remove ${attachment.originalName ?? 'receipt'}`}
      >
        <TrashIcon />
      </button>
    </div>
  )
}

function PendingThumb({
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

function AddButton({
  busy,
  atCap,
  onClick,
}: {
  busy: boolean
  atCap: boolean
  onClick: () => void
}) {
  const label = busy ? 'Adding…' : atCap ? 'Receipt limit reached' : 'Add receipt'
  return (
    <button
      type="button"
      className={styles.addBtn}
      disabled={busy || atCap}
      onClick={onClick}
    >
      <span className={styles.addIcon} aria-hidden>
        <CameraIcon />
      </span>
      {label}
    </button>
  )
}

function Overlays({
  viewing,
  removing,
  onCloseViewer,
  onConfirmRemove,
  onCancelRemove,
}: {
  viewing: TransactionAttachment | null
  removing: TransactionAttachment | null
  onCloseViewer: () => void
  onConfirmRemove: () => void
  onCancelRemove: () => void
}) {
  return (
    <>
      <PresenceValue value={viewing} exitMs={EXIT_MS.sheet}>
        {(attachment) => <ReceiptViewer attachment={attachment} onClose={onCloseViewer} />}
      </PresenceValue>
      <Presence show={removing != null} exitMs={EXIT_MS.sheet}>
        <ConfirmSheet
          title="Remove this receipt?"
          message="The file is deleted permanently. The transaction itself is unchanged."
          confirmLabel="Remove"
          destructive
          onConfirm={onConfirmRemove}
          onCancel={onCancelRemove}
        />
      </Presence>
    </>
  )
}

function useReceiptOps(
  transactionId: number | undefined,
  total: number,
  inputRef: React.RefObject<HTMLInputElement | null>,
  pendingFiles: PendingReceipt[],
  onPendingChange: ((files: PendingReceipt[]) => void) | undefined,
  actions: ExpenseActions,
) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const add = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setErr(null)
    const { kept, error } = capFilter(Array.from(files), total)
    if (error) setErr(error)
    if (inputRef.current) inputRef.current.value = ''
    if (kept.length === 0) return

    if (transactionId == null) {
      onPendingChange?.([...pendingFiles, ...stageReceipts(kept)])
      return
    }

    setBusy(true)
    try {
      for (const file of kept) {
        await actions.uploadAttachment(transactionId, file)
      }
    } catch (e) {
      setErr(errText(e, 'Could not add the receipt'))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: number) => {
    setBusy(true)
    setErr(null)
    try {
      await actions.deleteAttachment(id)
    } catch (e) {
      setErr(errText(e, 'Could not remove the receipt'))
    } finally {
      setBusy(false)
    }
  }

  const unstage = (index: number) => {
    setErr(null)
    onPendingChange?.(removeStaged(pendingFiles, index))
  }

  return { busy, err, add, remove, unstage }
}

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
  /** External ref to the hidden file input, so a chip row can trigger it. */
  externalInputRef?: React.RefObject<HTMLInputElement | null> | undefined
  /** Hide the label and inline add button (the compact chip row triggers the picker instead). */
  hideControls?: boolean
}

export function ReceiptStrip({
  transactionId,
  attachments,
  actions,
  pendingFiles = NO_PENDING,
  onPendingChange,
  onTrapPausedChange,
  externalInputRef,
  hideControls = false,
}: Props) {
  const ownInputRef = useRef<HTMLInputElement>(null)
  const inputRef = externalInputRef ?? ownInputRef
  const [viewing, setViewing] = useState<TransactionAttachment | null>(null)
  const [removing, setRemoving] = useState<TransactionAttachment | null>(null)
  const total = attachments.length + pendingFiles.length
  const atCap = total >= RECEIPT_CLIENT_POLICY.maxPerTransaction

  const { busy, err, add, remove, unstage } = useReceiptOps(
    transactionId,
    total,
    inputRef,
    pendingFiles,
    onPendingChange,
    actions,
  )

  const setOverlay = (next: TransactionAttachment | null, kind: 'view' | 'remove') => {
    if (kind === 'view') setViewing(next)
    else setRemoving(next)
    onTrapPausedChange?.(next !== null)
  }

  const confirmRemove = (attachment: TransactionAttachment) => {
    setOverlay(null, 'remove')
    void remove(attachment.id)
  }

  const hasThumbs = attachments.length > 0 || pendingFiles.length > 0

  return (
    <div className={styles.strip}>
      {!hideControls && <span className={styles.label}>Receipts</span>}
      {(!hideControls || hasThumbs) && (
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
          {!hideControls && (
            <AddButton busy={busy} atCap={atCap} onClick={() => inputRef.current?.click()} />
          )}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        className={styles.fileInput}
        accept={ACCEPT}
        multiple
        onChange={(e) => void add(e.target.files)}
      />

      {err ? (
        <p className={styles.error} role="alert">
          {err}
        </p>
      ) : null}
      {transactionId == null && pendingFiles.length > 0 ? (
        <p className={styles.hint}>Uploaded when you save.</p>
      ) : null}

      <Overlays
        viewing={viewing}
        removing={removing}
        onCloseViewer={() => setOverlay(null, 'view')}
        onConfirmRemove={() => confirmRemove(removing!)}
        onCancelRemove={() => setOverlay(null, 'remove')}
      />
    </div>
  )
}
