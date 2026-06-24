import styles from './Toast.module.css'

export type ToastTone = 'info' | 'success' | 'error'

export interface ToastItem {
  id: number
  message: string
  tone: ToastTone
}

/** Presentational snackbar. State + auto-dismiss live in ToastProvider. */
export function ToastViewport({
  toast,
  onDismiss,
}: {
  toast: ToastItem | null
  onDismiss: () => void
}) {
  if (!toast) return null
  return (
    <div className={styles.viewport} role="status" aria-live="polite">
      <div
        key={toast.id}
        className={`${styles.toast} ${styles[toast.tone]}`}
        onClick={onDismiss}
        role="presentation"
      >
        {toast.message}
      </div>
    </div>
  )
}
