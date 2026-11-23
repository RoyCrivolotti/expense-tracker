import type { TransactionAttachment } from '../../types'
import { EXIT_MS } from '../hooks/motion'
import { ConfirmSheet } from './ConfirmSheet'
import { Presence, PresenceValue } from './Presence'
import { ReceiptViewer } from './ReceiptViewer'

export function Overlays({
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
