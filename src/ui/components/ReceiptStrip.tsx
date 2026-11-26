import { useRef } from 'react'
import type { TransactionAttachment } from '../../types'
import type { PendingReceipt } from '../../data/pendingReceipts'
import type { ExpenseActions } from '../actions'
import { Overlays } from './ReceiptOverlays'
import { ReceiptFileInput, ReceiptItems, ReceiptMessages } from './ReceiptStripParts'
import { useReceiptOverlays } from './useReceiptOverlays'
import { useReceiptOps } from './useReceiptOps'
import styles from './ReceiptStrip.module.css'

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
  const { viewing, removing, setOverlay } = useReceiptOverlays(onTrapPausedChange)
  const total = attachments.length + pendingFiles.length

  const { busy, err, add, remove, unstage } = useReceiptOps(
    transactionId,
    total,
    inputRef,
    pendingFiles,
    onPendingChange,
    actions,
  )

  const confirmRemove = (attachment: TransactionAttachment) => {
    setOverlay(null, 'remove')
    void remove(attachment.id)
  }

  const hasThumbs = attachments.length > 0 || pendingFiles.length > 0

  return (
    <div className={styles.strip}>
      {!hideControls && <span className={styles.label}>Receipts</span>}
      {(!hideControls || hasThumbs) && (
        <ReceiptItems
          attachments={attachments}
          pendingFiles={pendingFiles}
          busy={busy}
          hideControls={hideControls}
          setOverlay={setOverlay}
          unstage={unstage}
          onAdd={() => inputRef.current?.click()}
        />
      )}
      <ReceiptFileInput inputRef={inputRef} onFiles={(files) => void add(files)} />

      <ReceiptMessages error={err} showHint={transactionId == null && pendingFiles.length > 0} />

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
