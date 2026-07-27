import { useRef } from 'react'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import { useFocusTrap } from '../hooks/useFocusTrap'
import styles from './ConfirmSheet.module.css'

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
  useBodyScrollLock(true)
  const sheetRef = useRef<HTMLDivElement>(null)
  useFocusTrap(sheetRef, onCancel)

  return (
    <div className={styles.overlay} onClick={onCancel} role="presentation">
      <div
        ref={sheetRef}
        className={styles.sheet}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={footnote ? 'confirm-message confirm-footnote' : 'confirm-message'}
        onClick={(e) => e.stopPropagation()}
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
      </div>
    </div>
  )
}
