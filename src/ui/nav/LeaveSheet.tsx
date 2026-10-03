import { ConfirmSheet } from '../components/ConfirmSheet'
import type { UnsavedWork } from './leaveGuardContext'
import { leaveMessage } from './leaveMessage'

/** Asked before leaving a section that holds unsaved edits. Stay is the first and focused button. */
export function LeaveSheet({
  work,
  onLeave,
  onStay,
}: {
  work: UnsavedWork
  onLeave: () => void
  onStay: () => void
}) {
  return (
    <ConfirmSheet
      title="Leave without saving?"
      message={leaveMessage(work)}
      confirmLabel="Leave"
      cancelLabel="Stay"
      destructive
      onConfirm={onLeave}
      onCancel={onStay}
    />
  )
}
