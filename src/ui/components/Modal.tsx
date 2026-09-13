import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { BackIcon, CloseIcon } from '../icons'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import { useVisualViewportRect } from '../hooks/useVisualViewportRect'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useSheetExit, type SheetExit } from '../hooks/useSheetExit'
import { sheetGrabProps, useSwipeDismiss } from '../hooks/useSwipeDismiss'
import styles from './Modal.module.css'

/** The scrim at rest. Thins towards nothing as the sheet is dragged away. */
const SCRIM_ALPHA = 0.5

interface ModalProps {
  title: string
  subtitle?: string | undefined
  onClose: () => void
  onBack?: (() => void) | undefined
  children: ReactNode
  /** True while a nested dialog (e.g. a `ConfirmSheet`) is open on top of this modal — see `useFocusTrap`. */
  trapPaused?: boolean
  /**
   * True when this modal's `onClose` may raise a confirm instead of actually
   * closing — an unsaved draft, say. The sheet then stays put and lets that happen,
   * rather than animating away from a close that is about to be refused. See
   * `useSheetExit`.
   */
  closeMayPrompt?: boolean
}

function overlayVars(viewport: { top: number; height: number } | null, progress: number, exit: SheetExit | null) {
  return {
    ...(viewport ? { top: viewport.top, height: viewport.height } : {}),
    // Thins out as the sheet is pulled away, so the gesture reads as reversible
    // progress rather than an on/off switch whose edge you cannot see.
    '--scrim': String(SCRIM_ALPHA * (1 - progress)),
    ...(exit
      ? {
          '--sheet-exit-ms': `${exit.ms}ms`,
          '--sheet-from': `${exit.fromPx}px`,
          '--sheet-exit-ease': exit.ease,
        }
      : {}),
  } as CSSProperties
}

export function Modal({
  title,
  subtitle,
  onClose,
  onBack,
  children,
  trapPaused = false,
  closeMayPrompt = false,
}: ModalProps) {
  useBodyScrollLock(true)
  // Follows the visible slice rather than the layout viewport, so an iOS
  // keyboard panning the screen cannot slide the sheet under the status bar.
  const viewport = useVisualViewportRect()
  const sheetRef = useRef<HTMLDivElement>(null)

  const { exit, requestClose } = useSheetExit(sheetRef, onClose, closeMayPrompt)
  const leaving = exit != null
  useFocusTrap(sheetRef, requestClose, trapPaused || leaving)
  const { offset, isDragging, progress } = useSwipeDismiss(sheetRef, requestClose, !trapPaused && !leaving)

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

  const sheetClasses = [styles.sheet, isDragging && styles.sheetDragging, leaving && styles.sheetClosing]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      {/* The scrim covers the whole screen; only this band tracks the visible
          slice, so nothing behind the modal can show through above the sheet. */}
      <div
        className={styles.band}
        style={viewport ? { top: viewport.top, height: viewport.height } : undefined}
    <div
      className={leaving ? `${styles.overlay} ${styles.overlayClosing}` : styles.overlay}
      style={overlayVars(viewport, progress, exit)}
      onClick={() => requestClose()}
      role="presentation"
    >
      <div
        ref={sheetRef}
        className={sheetClasses}
        style={!leaving && offset > 0 ? { transform: `translateY(${offset}px)` } : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
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
          )}
          <div className={styles.titleBlock}>
            <h2 ref={headingRef} tabIndex={-1}>
              {title}
            </h2>
            {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={() => requestClose()}
            aria-label="Close"
            className={`${styles.close} tapActive`}
          >
            <CloseIcon />
          </button>
        </header>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  )
}