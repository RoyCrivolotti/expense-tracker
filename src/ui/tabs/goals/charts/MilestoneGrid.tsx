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

/** What a cell says in its tinted box. */
function cellText(row: MilestoneRow, years: number | null, unit: YearsUnit): string {
  if (years === 0) return '✓'
  if (years === null) return `${unit === 'calendar' ? calendarYear(row, row.horizonYears) : row.horizonYears}+`
  return unit === 'calendar' ? String(calendarYear(row, years)) : `${years}y`
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

function GapLine({ row, plan, index }: { row: MilestoneRow; plan: MilestoneRow; index: number }) {
  const gap = gapVersus(row, plan, index)
  // Both already there: the check marks say it, and "=" under each is only noise.
  const text = gap === null || (gap.kind === 'same' && row.cells[index] === 0) ? ' ' : gapShort(gap)
  return (
    <span className={gap !== null && gapIsSooner(gap) ? `${styles.matrixGap} ${styles.matrixSooner}` : styles.matrixGap} aria-hidden="true">
      {text}
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
  sentence: string
  tabStop: boolean
  crosshair: string
  onPoint: () => void
}

function Cell({ row, rowIndex, colIndex, longest, unit, plan, sentence, tabStop, crosshair, onPoint }: CellProps) {
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
        {cellText(row, years, unit)}
      </span>
      {plan ? <GapLine row={row} plan={plan} index={colIndex} /> : null}
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
  const longest = Math.max(1, ...rows.map((r) => r.horizonYears))
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
