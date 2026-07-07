import { ConfirmSheet } from '../components/ConfirmSheet'
import { batchDeleteMessage } from './useTransactionSelection'

interface BatchDeleteConfirmProps {
  count: number
  onConfirm: () => void
  onCancel: () => void
}

export function BatchDeleteConfirm({ count, onConfirm, onCancel }: BatchDeleteConfirmProps) {
  return (
    <ConfirmSheet
      title="Delete transactions?"
      message={batchDeleteMessage(count)}
      confirmLabel="Delete"
      destructive
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}
