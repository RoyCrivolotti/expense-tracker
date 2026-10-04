import { useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import type { Milestone } from '../../../../types'
import { milestoneName, shortMonthYearLabel } from '../../../../engine'
import { formatMoneyShort } from '../chartTheme'
import { useMoneyFormat } from '../../../hooks/moneyFormatContext'
import { scenarioInk } from '../scenarioInk'
import { useGoalsNarrow } from '../useGoalsNarrow'
import {
  CELL_MOVES,
  calendarYear,
  gapIsSooner,
  gapShort,
  gapVersus,
  longestHorizon,
  moveCell,
  tintPercent,
  type CellMove,
  type MilestoneRow,
} from './milestoneModel'
import { ScrollRegion } from './ScrollRegion'
import styles from '../goals.module.css'

export type YearsUnit = 'years' | 'calendar'

/** The cell the reader is on: set by pointing, focus or a tap, and kept for the readout. */
export interface CellRef {
  rowId: string
  index: number
}

function MilestoneHead({
  milestone,
  reachedOn,
  marked,
  bare,
}: {
  milestone: Milestone
  reachedOn: string | undefined
  /** The column the reader is on. */
  marked: boolean
  /** The amount without its currency sign, where seven columns have to fit a phone. */
  bare: boolean
}) {
  const format = useMoneyFormat()
  const amount = formatMoneyShort(milestone.amountCents, format)
  const shown = bare ? formatMoneyShort(milestone.amountCents, { ...format, symbol: '' }).trim() : amount
  const name = milestoneName(milestone)
  // "by", not "on": the crossing happened somewhere between two check-ins.
  const tooltip = [name, amount, reachedOn ? `reached by ${reachedOn}` : null]
    .filter((part) => part !== null)
    .join(' · ')
  const classes = [styles.milestoneHead, styles.matrixHead]
  if (reachedOn !== undefined) classes.push(styles.milestoneHeadReached)
  if (marked) classes.push(styles.matrixMarked)

  return (
    <th className={classes.join(' ')} scope="col" title={tooltip}>
      {name ? <span className={styles.milestoneHeadName}>{name}</span> : null}
      <span
        className={
          name ? `${styles.milestoneHeadAmount} ${styles.milestoneHeadAmountSub}` : styles.milestoneHeadAmount
        }
      >
        {shown}
      </span>
      {reachedOn ? (
        <span className={styles.milestoneReachedOn}>
          <span aria-hidden="true">✓ </span>
          {shortMonthYearLabel(reachedOn)}
        </span>
      ) : null}
    </th>
  )
}

/**
 * What a cell says in its tinted box: the years from today, or the calendar year the path's own
 * yearly step falls in. Already there is a tick in both.
 */
function cellText(row: MilestoneRow, index: number, unit: YearsUnit): string {
  const years = row.cells[index] ?? null
  const calendar = unit === 'calendar'
  if (years === 0) return '✓'
  if (years === null) return `${calendar ? calendarYear(row, row.horizonYears) : row.horizonFromNow}+`
  return calendar ? String(calendarYear(row, row.sinceStart[index] ?? 0)) : `${years}y`
}

function boxClass(years: number | null): string {
  if (years === 0) return `${styles.matrixBox} ${styles.matrixDone}`
  if (years === null) return `${styles.matrixBox} ${styles.matrixBeyond}`
  return `${styles.matrixBox} ${styles.matrixTint}`
}

function crosshairClass(onRow: boolean, onCol: boolean): string {
  if (onRow && onCol) return styles.matrixCross ?? ''
  if (onRow || onCol) return styles.matrixLine ?? ''
  return ''
}

interface GapText {
  text: string
  sooner: boolean
}

/** The line under a cell while the table is comparing with the plan; null where there is nothing to say. */
function gapLabel(row: MilestoneRow, plan: MilestoneRow | null, index: number): GapText | null {
  const gap = gapVersus(row, plan, index)
  // Both already there: the check marks say it, and "=" under each is only noise.
  if (gap === null || (gap.kind === 'same' && row.cells[index] === 0)) return null
  return { text: gapShort(gap), sooner: gapIsSooner(gap) }
}

/** A row keeps the line under its cells only if one of them has something to put in it. */
function rowHasGaps(row: MilestoneRow, plan: MilestoneRow | null): boolean {
  return row.cells.some((_, index) => gapLabel(row, plan, index) !== null)
}

/** A blank line holds its height with a no-break space, so the cells of a row stay level. */
function GapLine({ label }: { label: GapText | null }) {
  return (
    <span className={label?.sooner ? `${styles.matrixGap} ${styles.matrixSooner}` : styles.matrixGap} aria-hidden="true">
      {label?.text ?? ' '}
    </span>
  )
}

interface CellProps {
  row: MilestoneRow
  rowIndex: number
  colIndex: number
  longest: number
  unit: YearsUnit
  /** The plan, while the table is comparing with it. */
  plan: MilestoneRow | null
  /** Whether the row keeps a line under its cells for the gap. */
  gaps: boolean
  sentence: string
  tabStop: boolean
  crosshair: string
  onPoint: () => void
}

function Cell({ row, rowIndex, colIndex, longest, unit, plan, gaps, sentence, tabStop, crosshair, onPoint }: CellProps) {
  const years = row.cells[colIndex] ?? null
  const tint = tintPercent(years, longest)
  const style = tint === null ? undefined : ({ '--tint': `${tint}%` } as CSSProperties)
  return (
    <td
      role="gridcell"
      className={`${styles.milestoneCell} ${styles.matrixCell} ${crosshair}`}
      tabIndex={tabStop ? 0 : -1}
      aria-label={sentence}
      data-row={rowIndex}
      data-col={colIndex}
      onFocus={onPoint}
      onMouseEnter={onPoint}
      onClick={onPoint}
    >
      <span className={boxClass(years)} style={style} aria-hidden="true">
        {cellText(row, colIndex, unit)}
      </span>
      {gaps ? <GapLine label={gapLabel(row, plan, colIndex)} /> : null}
    </td>
  )
}

function RowHead({ row, isPlanShown, marked }: { row: MilestoneRow; isPlanShown: boolean; marked: boolean }) {
  const classes = [styles.milestoneScenarioCell]
  if (row.kind === 'fromToday') classes.push(styles.matrixFromToday)
  if (marked) classes.push(styles.matrixMarked)
  return (
    <th scope="row" className={classes.join(' ')} title={row.name}>
      <span className={styles.milestoneScenarioNameRow}>
        <span className={styles.swatch} style={{ background: scenarioInk(row.color) }} />
        <span className={styles.milestoneScenarioName}>{row.name}</span>
        {isPlanShown ? <span className={styles.matrixPlanTag}>plan</span> : null}
      </span>
    </th>
  )
}

function stepOf(event: KeyboardEvent<HTMLTableElement>): { row: number; col: number } | null {
  const cell = (event.target as HTMLElement).closest<HTMLElement>('td[data-row]')
  if (!cell) return null
  return { row: Number(cell.dataset.row), col: Number(cell.dataset.col) }
}

/**
 * The grid itself: a row per path, a column per milestone, one tab stop that the arrow keys, Home
 * and End move between cells. Pointing at, focusing or tapping a cell reports it through
 * `onPoint`, which the card turns into the sentence under the table.
 */
export function MilestoneGrid({
  rows,
  milestones,
  reached,
  unit,
  plan,
  sentences,
  point,
  live,
  onPoint,
  onLeave,
}: {
  rows: MilestoneRow[]
  milestones: Milestone[]
  reached: Map<number, string>
  unit: YearsUnit
  plan: MilestoneRow | null
  /** `sentences[row][column]`: the plain sentence for each cell. */
  sentences: string[][]
  point: CellRef | null
  /** Whether the reader is still on the cell, which the row and column are marked for. */
  live: boolean
  onPoint: (cell: CellRef) => void
  onLeave: () => void
}) {
  const table = useRef<HTMLTableElement>(null)
  const narrow = useGoalsNarrow()
  const [stop, setStop] = useState({ row: 0, col: 0 })
  const longest = longestHorizon(rows)
  const gapRows = rows.map((row) => rowHasGaps(row, plan))
  const at = { row: Math.min(stop.row, rows.length - 1), col: Math.min(stop.col, milestones.length - 1) }
  const markedRow = live && point ? point.rowId : null
  const markedCol = live && point ? point.index : null

  function onKeyDown(event: KeyboardEvent<HTMLTableElement>) {
    if (!CELL_MOVES.includes(event.key)) return
    const from = stepOf(event)
    if (!from) return
    event.preventDefault()
    const to = moveCell(from, event.key as CellMove, { rows: rows.length, cols: milestones.length })
    table.current?.querySelector<HTMLElement>(`td[data-row="${to.row}"][data-col="${to.col}"]`)?.focus()
  }

  return (
    <ScrollRegion label="Years to milestone" focusable={false}>
      <table
        ref={table}
        className={`${styles.milestoneTable} ${styles.matrixTable}`}
        style={{ '--cols': milestones.length } as CSSProperties}
        role="grid"
        aria-label="Years to milestone, one row per path"
        onKeyDown={onKeyDown}
        onMouseLeave={onLeave}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) onLeave()
        }}
      >
        <thead>
          <tr>
            <th className={styles.milestoneScenarioHead}>Scenario</th>
            {milestones.map((m, i) => (
              <MilestoneHead
                key={m.amountCents}
                milestone={m}
                reachedOn={reached.get(m.amountCents)}
                marked={markedCol === i}
                bare={narrow}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={row.id}>
              <RowHead row={row} isPlanShown={plan !== null && row.id === plan.id} marked={markedRow === row.id} />
              {row.cells.map((_, c) => (
                <Cell
                  key={milestones[c]?.amountCents ?? c}
                  row={row}
                  rowIndex={r}
                  colIndex={c}
                  longest={longest}
                  unit={unit}
                  plan={plan}
                  gaps={gapRows[r] === true}
                  sentence={sentences[r]?.[c] ?? ''}
                  tabStop={at.row === r && at.col === c}
                  crosshair={crosshairClass(markedRow === row.id, markedCol === c)}
                  onPoint={() => {
                    setStop({ row: r, col: c })
                    onPoint({ rowId: row.id, index: c })
                  }}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollRegion>
  )
}
