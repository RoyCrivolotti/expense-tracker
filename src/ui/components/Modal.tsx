import { useEffect, useRef, type ReactNode } from 'react'
import { CloseIcon } from '../icons'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import { useFocusTrap } from '../hooks/useFocusTrap'
import styles from './Modal.module.css'

interface ModalProps {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  /** True while a nested dialog (e.g. a `ConfirmSheet`) is open on top of this modal — see `useFocusTrap`. */
  trapPaused?: boolean
  /** Experimental: widens the sheet for content that needs more horizontal
   * room than the standard stacked-card layout (e.g. the grid-rows trial). */
  wide?: boolean
}

export function Modal({ title, subtitle, onClose, children, trapPaused = false, wide = false }: ModalProps) {
  useBodyScrollLock(true)
  const sheetRef = useRef<HTMLDivElement>(null)
  useFocusTrap(sheetRef, onClose, trapPaused)

  const headingRef = useRef<HTMLHeadingElement>(null)
  // Skip the first run: useFocusTrap already sends initial focus to the first
  // focusable control on open, which is a better landing spot than the heading.
  // A later `title` change (e.g. a multi-step wizard advancing) has no other
  // focus-moving mechanism though, so screen reader users get no indication a
  // new step/screen loaded — move focus to the (now-updated) heading then.
  const skipNextTitleFocus = useRef(true)
  useEffect(() => {
    if (skipNextTitleFocus.current) {
      skipNextTitleFocus.current = false
      return
    }
    headingRef.current?.focus()
  }, [title])

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div
        ref={sheetRef}
        className={`${styles.sheet}${wide ? ` ${styles.sheetWide}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.header}>
          <div className={styles.titleBlock}>
            <h2 ref={headingRef} tabIndex={-1}>
              {title}
            </h2>
            {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className={`${styles.close} tapActive`}>
            <CloseIcon />
          </button>
        </header>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  )
}
