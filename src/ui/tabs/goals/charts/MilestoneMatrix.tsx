import { memo, useMemo, useState } from 'react'
import { useAssumedInflation } from '../../..//hooks/assumedInflationContext'
import type { GoalScenario, Milestone } from '../../../../types'
import type { PlanFromToday } from '../../../../engine'
import type { NewGoalScenario } from '../../../../data/dataSource'
import { milestoneLabelWithAmount } from '../../../../engine'
import { SegmentedControl } from '../../../components/SegmentedControl'
import { todayIso } from '../../../components/transactionFormState'
import { ChartShell } from './ChartShell'
import { MilestoneGrid, type CellRef, type YearsUnit } from './MilestoneGrid'
import { MilestoneReadout } from './MilestoneReadout'
import { MilestoneTimeline } from './MilestoneTimeline'
import { buildRows, describeCell, longestHorizon, type MilestoneRow } from './milestoneModel'
import { formatMoneyShort } from '../chartTheme'
import { useMoneyFormat } from '../../../hooks/moneyFormatContext'
import { useMediaQuery } from '../../../hooks/useMediaQuery'
import { useGoalsNarrow } from '../useGoalsNarrow'
import styles from '../goals.module.css'

const UNITS = [
  { value: 'years', label: 'Years from now' },
  { value: 'calendar', label: 'Calendar year' },
] as const

const VIEWS = [
  { value: 'table', label: 'Table' },
  { value: 'timeline', label: 'Timeline' },
] as const

type View = (typeof VIEWS)[number]['value']

const NO_PLAN = 'No scenario is marked as your current plan, so there is nothing to compare with.'

function Toolbar({
  unit,
  onUnit,
  vsPlan,
  onVsPlan,
  hasPlan,
}: {
  unit: YearsUnit
  onUnit: (unit: YearsUnit) => void
  vsPlan: boolean
  onVsPlan: () => void
  hasPlan: boolean
}) {
  return (
    <div className={styles.matrixTools}>
      <SegmentedControl options={[...UNITS]} value={unit} onChange={onUnit} ariaLabel="Show each milestone as" />
      <button
        type="button"
        className={styles.matrixToggle}
        aria-pressed={hasPlan && vsPlan}
        disabled={!hasPlan}
        title={hasPlan ? 'Show how many years sooner or later each path gets there than the plan' : NO_PLAN}
        onClick={onVsPlan}
      >
        vs plan
      </button>
    </div>
  )
}

function Legend({ longest, plan }: { longest: number; plan: MilestoneRow | null }) {
  return (
    <ul className={styles.matrixLegend}>
      <li>
        <span className={styles.matrixLegendDone} aria-hidden="true">
          ✓
        </span>
        Already there
      </li>
      <li>
        <span className={`${styles.matrixKey} ${styles.matrixKeyTint}`} aria-hidden="true" />
        Darker: further away (the darkest is {longest} {longest === 1 ? 'year' : 'years'})
      </li>
      <li>
        <span className={`${styles.matrixKey} ${styles.matrixKeyBeyond}`} aria-hidden="true" />
        Hatched: not within the path&apos;s horizon
      </li>
      {plan ? (
        <li>
          <span aria-hidden="true">
            <span className={styles.matrixLegendSooner}>&minus;2y</span> +3y
          </span>{' '}
          Years sooner or later than {plan.name}, the plan
        </li>
      ) : null}
    </ul>
  )
}

/** The sentence for the cell the reader is on, or null before they have been on one. */
function sentenceAt(point: CellRef | null, rows: MilestoneRow[], sentences: string[][]): string | null {
  if (!point) return null
  const row = rows.findIndex((r) => r.id === point.rowId)
  return sentences[row]?.[point.index] ?? null
}

function MatrixBody({
  rows,
  milestones,
  reached,
}: {
  rows: MilestoneRow[]
  milestones: Milestone[]
  reached: Map<number, string>
}) {
  const format = useMoneyFormat()
  const [unit, setUnit] = useState<YearsUnit>('years')
  const [vsPlan, setVsPlan] = useState(false)
  const [point, setPoint] = useState<CellRef | null>(null)
  const [live, setLive] = useState(false)
  // No hover on a touch screen: the cells are read by tapping them.
  const touch = useMediaQuery('(hover: none)')

  const plan = rows.find((r) => r.kind === 'plan') ?? null
  const comparing = vsPlan ? plan : null
  const sentences = useMemo(
    () =>
      rows.map((row) =>
        milestones.map((m, index) =>
          describeCell({
            row,
            index,
            amount: milestoneLabelWithAmount(m, (cents) => formatMoneyShort(cents, format)),
            reachedOn: reached.get(m.amountCents),
            plan: comparing,
          }),
        ),
      ),
    [rows, milestones, reached, format, comparing],
  )

  return (
    <>
      <Toolbar
        unit={unit}
        onUnit={setUnit}
        vsPlan={vsPlan}
        onVsPlan={() => setVsPlan((on) => !on)}
        hasPlan={plan !== null}
      />
      <MilestoneGrid
        rows={rows}
        milestones={milestones}
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
      <Legend longest={longestHorizon(rows)} plan={comparing} />
      <MilestoneReadout text={sentenceAt(point, rows, sentences)} touch={touch} what="a cell" more=" The arrow keys move between cells." />
    </>
  )
}

function MilestoneMatrixImpl({
  scenarios,
  draft,
  milestones,
  reached,
  includeDraft = true,
  fromToday = null,
  embedded = false,
}: {
  scenarios: GoalScenario[]
  draft: NewGoalScenario
  milestones: Milestone[]
  /** amountCents -> date first observed at or above, from check-in history. */
  reached: Map<number, string>
  /** False when the draft is a loaded scenario with no edits, which already has its row. */
  includeDraft?: boolean
  /** The plan restarted from the latest check-in, listed under the plan. */
  fromToday?: PlanFromToday | null | undefined
  embedded?: boolean
}) {
  const inflationRate = useAssumedInflation()
  const rows = useMemo(
    () => buildRows(scenarios, draft, milestones, inflationRate, includeDraft, fromToday, todayIso()),
    [scenarios, draft, milestones, inflationRate, includeDraft, fromToday],
  )
  // The timeline is for the wide page; the phone has the table alone.
  const narrow = useGoalsNarrow()
  const [choice, setChoice] = useState<View>('table')
  const view = narrow ? 'table' : choice

  return (
    <ChartShell embedded={embedded}>
      <div className={styles.matrixHeader}>
        <h3 className={styles.chartTitle}>Years to milestone</h3>
        {narrow || milestones.length === 0 ? null : (
          <SegmentedControl options={[...VIEWS]} value={view} onChange={setChoice} ariaLabel="Show years to milestone as" />
        )}
      </div>
      <p className={styles.chartHint}>
        Invested portfolio only. Edit the list in Assumptions.
        {fromToday ? ' "From today" counts years from your latest check-in.' : ''} A year here is the yearly step at
        which a path first reaches the amount, so it can be up to a year later than the date on the Progress tab.
        {view === 'timeline' ? ' Each dot is a milestone, at the year the path reaches it.' : ''}
      </p>
      {milestones.length === 0 ? (
        <p className={styles.chartHint}>No milestones set.</p>
      ) : (
        <>
          <div hidden={view !== 'table'}>
            <MatrixBody rows={rows} milestones={milestones} reached={reached} />
          </div>
          {view === 'timeline' ? <MilestoneTimeline rows={rows} milestones={milestones} reached={reached} /> : null}
        </>
      )}
    </ChartShell>
  )
}

export const MilestoneMatrix = memo(MilestoneMatrixImpl)
