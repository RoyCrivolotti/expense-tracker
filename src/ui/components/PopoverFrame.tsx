import type { ReactNode, RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { usePopoverMotion } from '../hooks/usePopoverMotion'
import type { Position } from '../hooks/usePopoverPosition'

interface Props {
  popoverRef: RefObject<HTMLDivElement | null>
  pos: Position | null
  motion: ReturnType<typeof usePopoverMotion>
  /** The stylesheet's `popover` and `popoverLeaving` classes. */
  classes: Readonly<Record<string, string>>
  label: string
  children: ReactNode
}

/**
 * The portalled box every picker popover draws: placed from `pos`, capped to the
 * visible band, and held through its exit by `motion`. The element `usePopoverPosition`
 * measures is this one, so it must stay a single div.
 */
export function PopoverFrame({ popoverRef, pos, motion, classes, label, children }: Props) {
  return createPortal(
    <div
      ref={popoverRef}
      className={motion.leaving ? `${classes.popover} ${classes.popoverLeaving}` : classes.popover}
      {...motion.attrs}
      style={{
        ...motion.exit,
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        // Capped to the visible band and scrollable, so a popover taller than
        // the space left by an open keyboard stays reachable instead of running
        // off the screen.
        maxHeight: pos?.maxHeight,
        overflowY: 'auto',
        visibility: pos ? 'visible' : 'hidden',
      }}
      role="dialog"
      aria-label={label}
    >
      {children}
    </div>,
    document.body,
  )
}
