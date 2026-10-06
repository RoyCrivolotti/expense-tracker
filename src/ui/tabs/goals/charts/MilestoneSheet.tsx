import { useState } from 'react'
import type { Milestone } from '../../../../types'
import { MilestoneGrid, type CellRef } from './MilestoneGrid'
import { MilestoneReadout } from './MilestoneReadout'
import { MilestoneToolbar } from './MilestoneToolbar'
import { SheetFrame } from './SheetFrame'
import { sentenceAt, type MilestoneRow, type YearsUnit } from './milestoneModel'
import styles from '../goals.module.css'

/**
 * Every milestone of every path on one screen, for a phone that is too narrow for them as the
 * card has them: the card shows a page of milestones, this takes the whole screen for all of
 * them, with the names and the headings held while the figures scroll. It is made for a phone
 * on its side (the card's width at 812px is five times what a column needs). A phone held upright
 * gets it drawn on its side, with a line that says to turn the phone to the left, because a page
 * cannot turn a locked screen; on its side, or with a mouse, it is as it is (`SheetFrame`).
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
  const [point, setPoint] = useState<CellRef | null>(null)
  const [live, setLive] = useState(false)

  return (
    <SheetFrame
      title="Years to milestone"
      label="Years to milestone, every milestone"
      toolbar={<MilestoneToolbar unit={unit} onUnit={onUnit} vsPlan={vsPlan} onVsPlan={onVsPlan} hasPlan={hasPlan} />}
      onClose={onClose}
    >
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
    </SheetFrame>
  )
}
