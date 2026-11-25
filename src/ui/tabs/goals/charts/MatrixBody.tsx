import { Presence } from '../../../components/Presence'
import { EXIT_MS } from '../../../hooks/motion'
import { MilestoneByGoal } from './MilestoneByGoal'
import { MilestoneGrid } from './MilestoneGrid'
import { MilestoneReadout } from './MilestoneReadout'
import { MilestoneSheet } from './MilestoneSheet'
import { MilestoneToolbar } from './MilestoneToolbar'
import { FoldedLine, Legend, PhoneTools } from './MilestoneMatrixParts'
import type { Milestone } from '../../../../types'
import { longestHorizon, type MilestoneRow } from './milestoneModel'
import { sentenceAt } from './milestoneTable'
import { useMatrixState, type MatrixState } from './useMatrixState'

/** The toolbar, and on a phone the milestones every path has and the way to page through the rest. */
function MatrixHead({ m }: { m: MatrixState }) {
  const { unit, setUnit, vsPlan, setVsPlan, plan, phone, milestones, folded, reached, view, setView, pages } = m
  const { shownPage, amountOf, setSheet, setPage, setPoint, setLive } = m
  return (
    <>
      <MilestoneToolbar
        unit={unit}
        onUnit={setUnit}
        vsPlan={vsPlan}
        onVsPlan={() => setVsPlan((on) => !on)}
        hasPlan={plan !== null}
      />
      {phone ? (
        <>
          <FoldedLine milestones={milestones} indices={folded} reached={reached} />
          <PhoneTools
            view={view}
            onView={setView}
            pages={pages}
            page={shownPage}
            label={amountOf}
            onSheet={() => setSheet(true)}
            onPage={(next) => {
              setPage(next)
              setPoint(null)
              setLive(false)
            }}
          />
        </>
      ) : null}
    </>
  )
}

/** The milestones one goal at a time on a phone, the grid otherwise. */
function MatrixCells({ m }: { m: MatrixState }) {
  const { byGoal, rows, milestones, open, goalIndex, setGoal, unit, comparing, columns, reached, sentences } = m
  const { point, live, setPoint, setLive } = m
  return (
    <>
      {byGoal ? (
        <MilestoneByGoal
          rows={rows}
          milestones={milestones}
          indices={open}
          index={goalIndex}
          onIndex={setGoal}
          unit={unit}
          plan={comparing}
        />
      ) : (
        <MilestoneGrid
          rows={rows}
          milestones={milestones}
          columns={columns}
          reached={reached}
          unit={unit}
          plan={comparing}
          sentences={sentences}
          point={point}
          live={live}
          onPoint={(cell) => {
            setPoint(cell)
            setLive(true)
          }}
          onLeave={() => setLive(false)}
        />
      )}
    </>
  )
}

/** The key, the sentence for the cell pointed at, and the sheet with every milestone. */
function MatrixFoot({ m }: { m: MatrixState }) {
  const { rows, comparing, byGoal, point, sentences, touch, phone, sheet, setSheet, milestones, reached } = m
  const { unit, setUnit, vsPlan, setVsPlan, plan } = m
  return (
    <>
      <Legend longest={longestHorizon(rows)} plan={comparing} />
      {byGoal ? null : (
        <MilestoneReadout
          text={sentenceAt(point, rows, sentences)}
          touch={touch}
          what="a cell"
          more=" The arrow keys move between cells."
        />
      )}
      <Presence show={phone && sheet} exitMs={EXIT_MS.fade}>
        <MilestoneSheet
          rows={rows}
          milestones={milestones}
          reached={reached}
          unit={unit}
          onUnit={setUnit}
          vsPlan={vsPlan}
          onVsPlan={() => setVsPlan((on) => !on)}
          plan={comparing}
          hasPlan={plan !== null}
          sentences={sentences}
          touch={touch}
          onClose={() => setSheet(false)}
        />
      </Presence>
    </>
  )
}

export function MatrixBody({
  rows,
  milestones,
  reached,
}: {
  rows: MilestoneRow[]
  milestones: Milestone[]
  reached: Map<number, string>
}) {
  const { box, m } = useMatrixState(rows, milestones, reached)
  return (
    <div ref={box}>
      <MatrixHead m={m} />
      <MatrixCells m={m} />
      <MatrixFoot m={m} />
    </div>
  )
}
