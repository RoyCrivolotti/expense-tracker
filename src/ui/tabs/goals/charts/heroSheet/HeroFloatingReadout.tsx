import { useLayoutEffect, useRef, type RefObject } from 'react'
import { CloseIcon, GripIcon, ResizeCornerIcon } from '../../../../icons'
import { exitVars } from '../../../../hooks/motion'
import { useExit } from '../../../../hooks/usePresence'
import type { Placement, Turn } from '../../../../hooks/cardPlacement'
import { useFloatingCard } from '../../../../hooks/useFloatingCard'
import { ReadoutLegend } from './HeroReadoutParts'
import type { Readout } from './useReadout'
import styles from './HeroChartSheet.module.css'

/**
 * The readout as a card over the chart, with all of it shown: taken by its grip and put anywhere in
 * the chart's box (or moved by the keys), made larger or smaller by its corner (what it says is
 * drawn at the scale that gives), and put back by its cross. It stays until it is put back, and shows
 * the year last pointed at. A purchase year's breakdown is a column beside the rows, so the card is
 * wider then and not taller.
 *
 * It is sized and placed by `useFloatingCard` from outside, by its width, height and transform alone,
 * so the element that arrives and leaves is the one inside it: an animation on the one being placed
 * would overrule the placing.
 *
 * Inside the sheet's `Presence`, so it leaves in the time that holds it: still where it was, and
 * out of reach of a second tap.
 */
export function HeroFloatingReadout({
  stage,
  placement,
  choice,
  turn,
  readout,
  onDock,
  focusOnMount,
}: {
  stage: RefObject<HTMLElement | null>
  placement: RefObject<Placement>
  /** The scale asked for, kept by the sheet so that it outlives the card; null until it has been. */
  choice: RefObject<number | null>
  turn: Turn
  readout: Readout
  onDock: () => void
  /** Take the focus when it arrives, as when it has just been floated by a control that is gone. */
  focusOnMount: boolean
}) {
  const card = useRef<HTMLDivElement>(null)
  const bar = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const grip = useRef<HTMLButtonElement>(null)
  const corner = useRef<HTMLButtonElement>(null)
  const { leaving, exitMs } = useExit()
  useFloatingCard({ stage, card, bar, content, grip, corner, placement, choice, turn, frozen: leaving })
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
        <div ref={bar} className={styles.floatBar}>
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
        <div className={styles.floatViewport}>
          <div ref={content} className={styles.floatContent}>
            <ReadoutLegend readout={readout} beside />
          </div>
        </div>
        <button
          ref={corner}
          type="button"
          className={styles.corner}
          aria-label="Resize the values. Drag, or use the arrow keys."
        >
          <ResizeCornerIcon aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
