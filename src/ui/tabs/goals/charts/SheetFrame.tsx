import { useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon } from '../../../icons'
import { exitVars } from '../../../hooks/motion'
import { useBodyScrollLock } from '../../../hooks/useBodyScrollLock'
import { useFocusTrap } from '../../../hooks/useFocusTrap'
import { useExit } from '../../../hooks/usePresence'
import { useSideways } from './sheetOrientation'
import styles from '../goals.module.css'

/**
 * The frame of a full-screen sheet on Goals: the screen to itself, the page behind it held still,
 * focus kept inside and handed back, and a bar with a title, the sheet's own controls and a close
 * button over whatever the sheet is about (`children`, which lays itself out in the column under
 * the bar). On a phone held upright it is drawn a quarter turn, with a line that says to turn the
 * phone to the left, because a page cannot turn a locked screen; on its side, or with a mouse, it
 * is as it is.
 *
 * The caller mounts it inside a `Presence`, which tells it when it has been let go, whichever way
 * that happened, so it can leave over the same path it came.
 */
export function SheetFrame({
  title,
  label,
  toolbar,
  onClose,
  children,
}: {
  title: string
  /** What a screen reader calls the dialog; longer than the title where that helps. */
  label: string
  /** The sheet's own controls, in the bar between the title and the close button. */
  toolbar: ReactNode
  onClose: () => void
  children: ReactNode
}) {
  // Told by the card's `Presence` that it has let go, whichever way it did.
  const { leaving, exitMs } = useExit()
  useBodyScrollLock(!leaving)
  const root = useRef<HTMLDivElement>(null)
  useFocusTrap(root, onClose, leaving)
  // Turned a quarter turn, so that it is read with the phone turned the other way.
  const sideways = useSideways()
  const classes = [styles.sheet, sideways && styles.sheetSideways, leaving && styles.sheetLeaving]

  // On the body, not in the card: the card sits in a page whose ancestors may clip or transform,
  // and a fixed surface inside one is placed against that instead of the screen.
  return createPortal(
    <div
      ref={root}
      className={classes.filter(Boolean).join(' ')}
      style={exitVars(leaving, exitMs)}
      inert={leaving}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <div className={styles.sheetBar}>
        <h2 className={styles.sheetTitle}>{title}</h2>
        {toolbar}
        <button type="button" className={styles.sheetClose} aria-label="Close" onClick={onClose}>
          <CloseIcon aria-hidden="true" />
        </button>
      </div>
      {sideways ? <p className={styles.sheetHint}>Turn your phone to the left to read this.</p> : null}
      {children}
    </div>,
    document.body,
  )
}
