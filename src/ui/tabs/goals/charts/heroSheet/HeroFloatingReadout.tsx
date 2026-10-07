import { useLayoutEffect, useRef, type RefObject } from 'react'
import { CloseIcon, GripIcon } from '../../../../icons'
import { exitVars } from '../../../../hooks/motion'
import { useExit } from '../../../../hooks/usePresence'
import type { Placement, Turn } from '../../../../hooks/cardPlacement'
import { useDraggableCard } from '../../../../hooks/useDraggableCard'
import { ReadoutLegend } from './HeroReadoutParts'
import type { Readout } from './useReadout'
import styles from './HeroChartSheet.module.css'

/**
 * The readout as a card over the chart, which can be taken by its grip and put anywhere in the
 * chart's box, or moved by the keys. It stays until it is put back (the cross), and shows the
 * year last pointed at. It is positioned by its transform alone, from outside, so the element
 * that arrives and leaves is the one inside it: an animation on the one being positioned would
 * overrule the position.
 *
 * Inside the sheet's `Presence`, so it leaves in the time that holds it: still where it was, and
 * out of reach of a second tap.
 */
export function HeroFloatingReadout({
  stage,
  placement,
  turn,
  readout,
  onDock,
  focusOnMount,
}: {
  stage: RefObject<HTMLElement | null>
  placement: RefObject<Placement>
  turn: Turn
  readout: Readout
  onDock: () => void
  /** Take the focus when it arrives, as when it has just been floated by a control that is gone. */
  focusOnMount: boolean
}) {
  const card = useRef<HTMLDivElement>(null)
  const grip = useRef<HTMLButtonElement>(null)
  const { leaving, exitMs } = useExit()
  useDraggableCard({ stage, card, handle: grip, placement, turn, frozen: leaving })
  useLayoutEffect(() => {
    if (focusOnMount) grip.current?.focus()
  }, [focusOnMount])

  return (
    <div ref={card} className={styles.floatPos} inert={leaving}>
      <div
        className={leaving ? `${styles.floatCard} ${styles.floatLeaving}` : styles.floatCard}
        style={exitVars(leaving, exitMs)}
        role="group"
        aria-label="Values for the year"
      >
        <div className={styles.floatBar}>
          <button
            ref={grip}
            type="button"
            className={styles.grip}
            aria-label="Move the values. Drag, or use the arrow keys."
          >
            <GripIcon aria-hidden="true" />
          </button>
          <button type="button" className={styles.dock} aria-label="Put the values back beside the chart" onClick={onDock}>
            <CloseIcon aria-hidden="true" />
          </button>
        </div>
        <div className={styles.floatBody}>
          <ReadoutLegend readout={readout} />
        </div>
      </div>
    </div>
  )
}
