import { ConfirmSheet } from '../components/ConfirmSheet'
import { batchDeleteMessage } from './useTransactionSelection'

interface BatchDeleteConfirmProps {
  count: number
  /** Chosen rows that are not on screen, which the delete leaves alone. */
  hiddenCount?: number
  onConfirm: () => void
  onCancel: () => void
}

export function BatchDeleteConfirm({ count, hiddenCount = 0, onConfirm, onCancel }: BatchDeleteConfirmProps) {
  return (
    <ConfirmSheet
      title="Delete transactions?"
      message={batchDeleteMessage(count, hiddenCount)}
      confirmLabel="Delete"
      destructive
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}
