import { useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { exitVars } from '../hooks/motion'
import { useExit } from '../hooks/usePresence'
import styles from './ConfirmSheet.module.css'

interface ConfirmFrameProps {
  onCancel: () => void
  labelledBy: string
  describedBy: string
  children: ReactNode
}

/**
 * The overlay, the sheet and the way they arrive and leave, shared by every dialog that
 * asks a question before doing something.
 *
 * Rendered into the body rather than in place. These are opened from inside a `Modal`, and
 * when that modal is closed by the very answer given here (Discard), its sheet slides
 * away: a transformed ancestor becomes the containing block of everything `position:
 * fixed` inside it, so an inline overlay would shrink to the sliding sheet and be clipped
 * by it halfway through leaving.
 */
export function ConfirmFrame({ onCancel, labelledBy, describedBy, children }: ConfirmFrameProps) {
  useBodyScrollLock(true)
  const sheetRef = useRef<HTMLDivElement>(null)
  const { leaving, exitMs } = useExit()
  useFocusTrap(sheetRef, onCancel, leaving)

  return createPortal(
    <div
      className={leaving ? `${styles.overlay} ${styles.overlayClosing}` : styles.overlay}
      style={exitVars(leaving, exitMs)}
      // Answered already. A second tap on the same button should not answer it twice.
      inert={leaving}
      onClick={onCancel}
      role="presentation"
    >
      <div
        ref={sheetRef}
        className={leaving ? `${styles.sheet} ${styles.sheetClosing}` : styles.sheet}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}

interface ConfirmSheetProps {
  title: string
  /** A single sentence, or a short list of lines rendered as bullet points. */
  message: string | string[]
  /** Small muted note shown below the message, e.g. a caveat that applies regardless of content. */
  footnote?: string
  confirmLabel: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmSheet({
  title,
  message,
  footnote,
  confirmLabel,
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmSheetProps) {
  return (
    <ConfirmFrame
      onCancel={onCancel}
      labelledBy="confirm-title"
      describedBy={footnote ? 'confirm-message confirm-footnote' : 'confirm-message'}
    >
      <h2 id="confirm-title" className={styles.title}>
        {title}
      </h2>
      {Array.isArray(message) ? (
        <ul id="confirm-message" className={styles.messageList}>
          {message.map((line, index) => (
            // Index key: lines can repeat verbatim, and the list order never changes.
            <li key={index}>{line}</li>
          ))}
        </ul>
      ) : (
        <p id="confirm-message" className={styles.message}>
          {message}
        </p>
      )}
      {footnote ? (
        <p id="confirm-footnote" className={styles.footnote}>
          {footnote}
        </p>
      ) : null}
      <div className={styles.actions}>
        <button type="button" className={styles.cancel} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className={`${styles.confirm}${destructive ? ` ${styles.confirmDestructive}` : ''}`}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </ConfirmFrame>
  )
}
