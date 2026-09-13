import { useEffect, useRef, type ReactNode } from 'react'
import { BackIcon, CloseIcon } from '../icons'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import { useVisualViewportRect } from '../hooks/useVisualViewportRect'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { sheetGrabProps, useSwipeDismiss } from '../hooks/useSwipeDismiss'
import styles from './Modal.module.css'

interface ModalProps {
  title: string
  subtitle?: string | undefined
  onClose: () => void
  onBack?: (() => void) | undefined
  children: ReactNode
  /** True while a nested dialog (e.g. a `ConfirmSheet`) is open on top of this modal — see `useFocusTrap`. */
  trapPaused?: boolean
}

export function Modal({ title, subtitle, onClose, onBack, children, trapPaused = false }: ModalProps) {
  useBodyScrollLock(true)
  // Follows the visible slice rather than the layout viewport, so an iOS
  // keyboard panning the screen cannot slide the sheet under the status bar.
  const viewport = useVisualViewportRect()
  const sheetRef = useRef<HTMLDivElement>(null)
  useFocusTrap(sheetRef, onClose, trapPaused)
  // Same exit as tapping the backdrop, so consumers that guard their close (see
  // TransactionModal's unsaved-draft confirm) guard this too. Stood down while a
  // nested dialog is up: that sheet renders inside this one, and a drag meant for it
  // would otherwise dismiss what it is sitting on.
  const { offset, isDragging } = useSwipeDismiss(sheetRef, onClose, !trapPaused)

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
      {/* The scrim covers the whole screen; only this band tracks the visible
          slice, so nothing behind the modal can show through above the sheet. */}
      <div
        className={styles.band}
        style={viewport ? { top: viewport.top, height: viewport.height } : undefined}
      >
        <div
          ref={sheetRef}
          className={`${styles.sheet}${isDragging ? ` ${styles.sheetDragging}` : ''}`}
          style={offset > 0 ? { transform: `translateY(${offset}px)` } : undefined}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Still `aria-hidden`: it is a drag target, but dragging is not something a
              screen reader can do, and an unlabelled div announces nothing useful. The
              Close button below is the equivalent that is actually reachable. */}
          <div className={styles.handle} aria-hidden {...sheetGrabProps} />
          <header className={styles.header} {...sheetGrabProps}>
            {onBack && (
              <button type="button" onClick={onBack} aria-label="Back" className={`${styles.back} tapActive`}>
                <BackIcon />
              </button>
            )}
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
    </div>
  )
}