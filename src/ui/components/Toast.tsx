import { EXIT_MS, exitVars } from '../hooks/motion'
import { useExit } from '../hooks/usePresence'
import { PresenceValue } from './Presence'
import styles from './Toast.module.css'

export type ToastTone = 'info' | 'success' | 'error'

/** A button in the toast that takes back what the message says was done. */
export interface ToastAction {
  label: string
  onAction: () => void
}

export interface ToastItem {
  id: number
  message: string
  tone: ToastTone
  action?: ToastAction | undefined
}

/** Presentational snackbar. State + auto-dismiss live in ToastProvider. */
export function ToastViewport({
  toast,
  onDismiss,
}: {
  toast: ToastItem | null
  onDismiss: () => void
}) {
  // Held for its exit, so the message fades out with its words still in it instead of
  // vanishing in the middle of being read.
  return (
    <PresenceValue value={toast} exitMs={EXIT_MS.fade}>
      {(shown) => <ToastBubble toast={shown} onDismiss={onDismiss} />}
    </PresenceValue>
  )
}

function ToastBubble({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const { leaving, exitMs } = useExit()
  return (
    <div className={styles.viewport} role="status" aria-live="polite">
      <div
        key={toast.id}
        className={`${styles.toast} ${styles[toast.tone]}${toast.action ? ` ${styles.withAction}` : ''}${leaving ? ` ${styles.leaving}` : ''}`}
        style={exitVars(leaving, exitMs)}
        onClick={onDismiss}
        role="presentation"
      >
        {toast.message}
        {toast.action ? (
          <button
            type="button"
            className={styles.action}
            onClick={(event) => {
              // The tap is the action, which then takes the toast with it.
              event.stopPropagation()
              toast.action?.onAction()
              onDismiss()
            }}
          >
            {toast.action.label}
          </button>
        ) : null}
      </div>
    </div>
  )
}
