import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Milestone } from '../../../../types'
import { CloseIcon } from '../../../icons'
import { exitVars } from '../../../hooks/motion'
import { useBodyScrollLock } from '../../../hooks/useBodyScrollLock'
import { useFocusTrap } from '../../../hooks/useFocusTrap'
import { useMediaQuery } from '../../../hooks/useMediaQuery'
import { useExit } from '../../../hooks/usePresence'
import { MilestoneGrid, type CellRef } from './MilestoneGrid'
import { MilestoneReadout } from './MilestoneReadout'
import { MilestoneToolbar } from './MilestoneToolbar'
import { sentenceAt, type MilestoneRow, type YearsUnit } from './milestoneModel'
import styles from '../goals.module.css'

/**
 * Every milestone of every path on one screen, for a phone that is too narrow for them as the
 * card has them: the card shows a page of milestones, this takes the whole screen for all of
 * them, with the names and the headings held while the figures scroll. It is made for a phone
 * on its side (the card's width at 812px is five times what a column needs); held upright it
 * scrolls sideways, with a line that says to turn the phone.
 *
 * It reads and changes the card's own choices (years or calendar year, against the plan), so
 * closing it leaves the card as the sheet had it.
 */
export function MilestoneSheet({
  rows,
  milestones,
  reached,
  unit,
  onUnit,
  vsPlan,
  onVsPlan,
  plan,
  hasPlan,
  sentences,
  touch,
  onClose,
}: {
  rows: MilestoneRow[]
  milestones: Milestone[]
  reached: Map<number, string>
  unit: YearsUnit
  onUnit: (unit: YearsUnit) => void
  vsPlan: boolean
  onVsPlan: () => void
  /** The plan, while the table is comparing with it. */
  plan: MilestoneRow | null
  hasPlan: boolean
  sentences: string[][]
  touch: boolean
  onClose: () => void
}) {
  // Told by the card's `Presence` that it has let go, whichever way it did.
  const { leaving, exitMs } = useExit()
  useBodyScrollLock(!leaving)
  const root = useRef<HTMLDivElement>(null)
  useFocusTrap(root, onClose, leaving)
  const [point, setPoint] = useState<CellRef | null>(null)
  const [live, setLive] = useState(false)
  const upright = useMediaQuery('(orientation: portrait)')

  // On the body, not in the card: the card sits in a page whose ancestors may clip or transform,
  // and a fixed surface inside one is placed against that instead of the screen.
  return createPortal(
    <div
      ref={root}
      className={leaving ? `${styles.sheet} ${styles.sheetLeaving}` : styles.sheet}
      style={exitVars(leaving, exitMs)}
      inert={leaving}
      role="dialog"
      aria-modal="true"
      aria-label="Years to milestone, every milestone"
    >
      <div className={styles.sheetBar}>
        <h2 className={styles.sheetTitle}>Years to milestone</h2>
        <MilestoneToolbar unit={unit} onUnit={onUnit} vsPlan={vsPlan} onVsPlan={onVsPlan} hasPlan={hasPlan} />
        <button type="button" className={styles.sheetClose} aria-label="Close" onClick={onClose}>
          <CloseIcon aria-hidden="true" />
        </button>
      </div>
      {upright && touch ? <p className={styles.sheetHint}>Turn your phone sideways for more room.</p> : null}
      <div className={styles.sheetBody}>
        <MilestoneGrid
          className={styles.matrixTableSheet}
          keepSign
          rows={rows}
          milestones={milestones}
          reached={reached}
          unit={unit}
          plan={plan}
          sentences={sentences}
          point={point}
          live={live}
          onPoint={(cell) => {
            setPoint(cell)
            setLive(true)
          }}
          onLeave={() => setLive(false)}
        />
      </div>
      <MilestoneReadout text={sentenceAt(point, rows, sentences)} touch={touch} what="a cell" />
    </div>,
    document.body,
  )
}
