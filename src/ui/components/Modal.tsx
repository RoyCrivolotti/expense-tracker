import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { BackIcon, CloseIcon } from '../icons'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import { useVisualViewportRect } from '../hooks/useVisualViewportRect'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useExit } from '../hooks/usePresence'
import { EASE_THROWN, useSheetExit, type SheetRelease } from '../hooks/useSheetExit'
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
}

/**
 * The scrim and, once the sheet is leaving, how it leaves. `--exit-ms` is what `Presence`
 * holds the sheet in the DOM for, so the CSS animation and the mount cannot disagree.
 */
function overlayVars(progress: number, exit: { release: SheetRelease | null; ms: number } | null): CSSProperties {
  if (!exit) return { '--scrim': String(SCRIM_ALPHA * (1 - progress)) } as CSSProperties
  const { release } = exit
  return {
    // Frozen where the finger let go. By now `progress` is back at zero, and reading it
    // would flash the scrim to full darkness for the first frame of the exit.
    '--scrim': String(SCRIM_ALPHA * (1 - (release?.progress ?? 0))),
    '--exit-ms': `${release?.ms ?? exit.ms}ms`,
    '--sheet-from': `${release?.fromPx ?? 0}px`,
    ...(release ? { '--exit-ease': EASE_THROWN } : {}),
  } as CSSProperties
}

function bandPosition(viewport: { top: number; height: number } | null): CSSProperties | undefined {
  return viewport ? { top: viewport.top, height: viewport.height } : undefined
}

export function Modal({
  title,
  subtitle,
  onClose,
  onBack,
  children,
  trapPaused = false,
}: ModalProps) {
  useBodyScrollLock(true)
  // Follows the visible slice rather than the layout viewport, so an iOS
  // keyboard panning the screen cannot slide the sheet under the status bar.
  const viewport = useVisualViewportRect()
  const sheetRef = useRef<HTMLDivElement>(null)

  // Told by the owner's `Presence` that it has let go, whichever way it did: the Close
  // button, a swipe, Save, or anything else that clears the state this modal hangs on.
  const { leaving, exitMs } = useExit()
  const { release, requestClose } = useSheetExit(sheetRef, onClose, leaving)
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
    <div
      className={leaving ? `${styles.overlay} ${styles.overlayClosing}` : styles.overlay}
      style={overlayVars(progress, leaving ? { release, ms: exitMs } : null)}
      // Nothing inside a sheet that is on its way out should still take a tap or a
      // keystroke: a second Enter in a form that just saved would save it again.
      inert={leaving}
      onClick={() => requestClose()}
      role="presentation"
    >
      {/* The scrim covers the whole screen; only this band tracks the visible
          slice, so nothing behind the modal can show through above the sheet. */}
      <div
        className={styles.band}
        style={bandPosition(viewport)}
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
    </div>
  )
}
