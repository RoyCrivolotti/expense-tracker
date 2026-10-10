import { memo, useMemo, useRef, useState } from 'react'
import { useAssumedInflation } from '../../..//hooks/assumedInflationContext'
import type { GoalScenario, Milestone } from '../../../../types'
import type { PlanFromToday } from '../../../../engine'
import type { NewGoalScenario } from '../../../../data/dataSource'
import { milestoneLabelWithAmount, shortMonthYearLabel } from '../../../../engine'
import { Presence } from '../../../components/Presence'
import { SegmentedControl } from '../../../components/SegmentedControl'
import { EXIT_MS } from '../../../hooks/motion'
import { ExpandIcon } from '../../../icons'
import { todayIso } from '../../../components/transactionFormState'
import { ChartShell } from './ChartShell'
import { MilestoneByGoal } from './MilestoneByGoal'
import { MilestoneGrid, type CellRef, type YearsUnit } from './MilestoneGrid'
import { MilestoneReadout } from './MilestoneReadout'
import { MilestoneSheet } from './MilestoneSheet'
import { MilestoneToolbar } from './MilestoneToolbar'
import { MilestoneTimeline } from './MilestoneTimeline'
import {
  buildRows,
  describeCell,
  goalsPerPage,
  longestHorizon,
  pageLabel,
  reachedByEveryRow,
  sentenceAt,
  splitPages,
  type MilestoneRow,
} from './milestoneModel'
import { formatMoneyShort } from '../chartTheme'
import { useElementWidth } from '../../../hooks/useElementWidth'
import { useMoneyFormat } from '../../../hooks/moneyFormatContext'
import { useMediaQuery } from '../../../hooks/useMediaQuery'
import { useGoalsNarrow } from '../useGoalsNarrow'
import styles from '../goals.module.css'

const VIEWS = [
  { value: 'table', label: 'Table' },
  { value: 'timeline', label: 'Timeline' },
] as const

type View = (typeof VIEWS)[number]['value']

/** The width of a 375px phone's card, which is what a test (no layout) and the first paint go by. */
const PHONE_WIDTH = 327

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

const PHONE_VIEWS = [
  { value: 'table', label: 'Table' },
  { value: 'goal', label: 'By goal' },
] as const

type PhoneView = (typeof PHONE_VIEWS)[number]['value']

/**
 * The milestones every path already has, said once in words instead of as a column of ticks.
 * A date is given where the check-ins saw the milestone reached.
 */
function FoldedLine({
  milestones,
  indices,
  reached,
}: {
  milestones: Milestone[]
  indices: number[]
  reached: Map<number, string>
}) {
  const format = useMoneyFormat()
  if (indices.length === 0) return null
  const parts = indices.map((i) => milestoneLabelWithAmount(milestones[i] as Milestone, (cents) => formatMoneyShort(cents, format)))
  // The check-ins' date is said once when they all agree on it: five dates in a row are noise.
  const dates = new Set(indices.map((i) => reached.get((milestones[i] as Milestone).amountCents)))
  const [date] = dates
  return (
    <p className={styles.matrixFolded}>
      <span aria-hidden="true">✓ </span>
      Already there on every path: {parts.join(', ')}
      {dates.size === 1 && date ? ` (by ${shortMonthYearLabel(date)})` : ''}
    </p>
  )
}

/**
 * The two ways to read the table on a phone, which page of milestones the table is on, and, where
 * it has more than one, the way to open every milestone at once.
 */
function PhoneTools({
  view,
  onView,
  pages,
  page,
  onPage,
  label,
  onSheet,
}: {
  view: PhoneView
  onView: (view: PhoneView) => void
  pages: number[][]
  page: number
  onPage: (page: number) => void
  label: (index: number) => string
  onSheet: () => void
}) {
  return (
    <div className={styles.matrixPhoneTools}>
      <div className={styles.matrixPhoneRow}>
        <SegmentedControl options={[...PHONE_VIEWS]} value={view} onChange={onView} ariaLabel="Read the milestones as" />
        {pages.length > 1 ? (
          <button type="button" className={styles.matrixToggle} onClick={onSheet}>
            <ExpandIcon className={styles.matrixToggleIcon} aria-hidden="true" />
            All milestones
          </button>
        ) : null}
      </div>
      {view === 'table' && pages.length > 1 ? (
        <SegmentedControl
          layout="scroll"
          ariaLabel="Milestones shown"
          value={String(page)}
          onChange={(value) => onPage(Number(value))}
          options={pages.map((p, i) => ({
            value: String(i),
            label: pageLabel(label(p[0] as number), label(p[p.length - 1] as number)),
          }))}
        />
      ) : null}
    </div>
  )
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
  const [view, setView] = useState<PhoneView>('table')
  const [page, setPage] = useState(0)
  const [goal, setGoal] = useState(0)
  const [sheet, setSheet] = useState(false)
  // No hover on a touch screen: the cells are read by tapping them.
  const touch = useMediaQuery('(hover: none)')
  // On the phone the table shows as many milestones as its width holds, a page at a time.
  const phone = useGoalsNarrow()
  const box = useRef<HTMLDivElement>(null)
  const width = useElementWidth(box, PHONE_WIDTH)

  const plan = rows.find((r) => r.kind === 'plan') ?? null
  const comparing = vsPlan ? plan : null
  const all = useMemo(() => milestones.map((_, i) => i), [milestones])
  const folded = useMemo(() => (phone ? reachedByEveryRow(rows, milestones.length) : []), [phone, rows, milestones])
  const open = useMemo(() => all.filter((i) => !folded.includes(i)), [all, folded])
  const pages = useMemo(() => (phone ? splitPages(open, goalsPerPage(width)) : [open]), [phone, open, width])
  const shownPage = Math.min(page, pages.length - 1)
  const columns = phone ? pages[shownPage] : undefined
  const byGoal = phone && view === 'goal'
  const goalIndex = open.includes(goal) ? goal : (open[0] ?? 0)
  const amountOf = (i: number) => formatMoneyShort((milestones[i] as Milestone).amountCents, format)
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
    <div ref={box}>
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
    </div>
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
  const today = todayIso()
  const rows = useMemo(
    () => buildRows(scenarios, draft, milestones, inflationRate, includeDraft, fromToday, today),
    [scenarios, draft, milestones, inflationRate, includeDraft, fromToday, today],
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
        Invested portfolio only. Edit the list in Assumptions. A milestone is an amount on your account, so each path is
        counted after inflation. Every path is counted in whole years from today, rounded up from the day it first
        reaches the amount, so it can be up to a year later than the date on the Progress tab.{fromToday ? ' "From today" is the plan started again from your latest check-in.' : ''}
        {view === 'timeline' ? ' Each dot is a milestone, at the years from now the path reaches it.' : ''}
      </p>
      {milestones.length === 0 ? (
        <p className={styles.chartHint}>No milestones set.</p>
      ) : (
        <>
          <div hidden={view !== 'table'}>
            <MatrixBody rows={rows} milestones={milestones} reached={reached} />
          </div>
          {view === 'timeline' ? <MilestoneTimeline rows={rows} milestones={milestones} reached={reached} today={today} /> : null}
        </>
      )}
    </ChartShell>
  )
}

export const MilestoneMatrix = memo(MilestoneMatrixImpl)
