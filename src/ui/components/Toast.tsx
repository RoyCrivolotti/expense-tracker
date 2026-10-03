import { useEffect } from 'react'
import { EXIT_MS, exitVars } from '../hooks/motion'
import { useExit } from '../hooks/usePresence'
import { PresenceValue } from './Presence'
import styles from './Toast.module.css'

export type ToastTone = 'info' | 'success' | 'error'

/** A key held with Alt that does what a toast's button does, for whoever is not holding a finger over it. */
export interface ToastShortcut {
  /** `KeyboardEvent.code`, not `key`: Option+Z types a different letter on a Mac. */
  code: string
  /** How it is written to a person, e.g. "Alt+Z". */
  label: string
}

/** A button in the toast that takes back what the message says was done. */
export interface ToastAction {
  label: string
  onAction: () => void
  /** The same thing from the keyboard, without moving focus. Held for as long as the toast is up. */
  shortcut?: ToastShortcut | undefined
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

/**
 * Runs the toast's button on its shortcut. Alt alone, on the key's position: with Ctrl or Meta
 * it is a browser's or a layout's key (AltGr is Ctrl and Alt on Windows). A toast that is already
 * leaving has been dismissed, so it no longer answers.
 */
function useToastShortcut(action: ToastAction | undefined, answering: boolean, done: () => void) {
  useEffect(() => {
    const shortcut = action?.shortcut
    if (!action || !shortcut || !answering) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== shortcut.code || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.repeat) return
      event.preventDefault()
      action.onAction()
      done()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [action, answering, done])
}

function ToastBubble({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const { leaving, exitMs } = useExit()
  useToastShortcut(toast.action, !leaving, onDismiss)
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
        {toast.action?.shortcut ? <span className={styles.srOnly}>. Press {toast.action.shortcut.label} to {toast.action.label.toLowerCase()}.</span> : null}
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
        {toast.action?.shortcut ? (
          <kbd className={styles.shortcut} aria-hidden="true">
            {toast.action.shortcut.label}
          </kbd>
        ) : null}
      </div>
    </div>
  )
}
