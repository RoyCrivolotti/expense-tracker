import { useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import type { Milestone } from '../../../../types'
import { useGoalsNarrow } from '../useGoalsNarrow'
import { CELL_MOVES, moveCell, type CellMove, type CellRef, type YearsUnit } from './milestoneTable'
import { longestHorizon, type MilestoneRow } from './milestoneModel'
import { rowHasGaps } from './milestoneGaps'
import { Cell, GridHead, RowHead } from './MilestoneGridCells'
import { ScrollRegion } from './ScrollRegion'
import styles from '../goals.module.css'

export type { CellRef, YearsUnit }

/** On a phone, more columns than this leave no room for the currency sign in a head. */
const MAX_WITH_SIGN = 5

function crosshairClass(
  onRow: boolean,
  onCol: boolean,
): string {
  if (onRow && onCol) return styles.matrixCross ?? ''
  if (onRow || onCol) return styles.matrixLine ?? ''
  return ''
}

function stepOf(event: KeyboardEvent<HTMLTableElement>): { row: number; col: number } | null {
  const cell = (event.target as HTMLElement).closest<HTMLElement>('td[data-row]')
  if (!cell) return null
  return { row: Number(cell.dataset.row), col: Number(cell.dataset.col) }
}

/** Moves the focus to the cell an arrow key, Home or End leads to, among the columns shown. */
function moveFocus(
  event: KeyboardEvent<HTMLTableElement>,
  shown: number[],
  rowCount: number,
  table: HTMLTableElement | null,
) {
  if (!CELL_MOVES.includes(event.key)) return
  const from = stepOf(event)
  if (!from) return
  event.preventDefault()
  const to = moveCell({ row: from.row, col: shown.indexOf(from.col) }, event.key as CellMove, {
    rows: rowCount,
    cols: shown.length,
  })
  const col = shown[to.col] ?? from.col
  table?.querySelector<HTMLElement>(`td[data-row="${to.row}"][data-col="${col}"]`)?.focus()
}

interface GridProps {
  rows: MilestoneRow[]
  milestones: Milestone[]
  /** The milestones to show, by index, in order; all of them when left out. */
  columns?: number[] | undefined
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
  /** Added to the table's own classes. */
  className?: string | undefined
  /** Keeps the currency sign in the heads however many columns there are, for a table with the room. */
  keepSign?: boolean
}

/**
 * The grid itself: a row per path, a column per milestone, one tab stop that the arrow keys, Home
 * and End move between cells. Pointing at, focusing or tapping a cell reports it through
 * `onPoint`, which the card turns into the sentence under the table.
 */
export function MilestoneGrid(props: GridProps) {
  const { rows, milestones, columns, reached, unit, plan, sentences, point, live, onPoint, onLeave, className } = props
  const keepSign = props.keepSign ?? false
  const table = useRef<HTMLTableElement>(null)
  const narrow = useGoalsNarrow()
  const [stop, setStop] = useState({ row: 0, col: 0 })
  const longest = longestHorizon(rows)
  const gapRows = rows.map((row) => rowHasGaps(row, plan))
  // `data-col` and the focus stop are milestone indices, so a page of columns keeps them stable.
  const shown = columns ?? milestones.map((_, i) => i)
  const stopCol = shown.includes(stop.col) ? stop.col : (shown[0] ?? 0)
  const at = { row: Math.min(stop.row, rows.length - 1), col: stopCol }
  const markedRow = live && point ? point.rowId : null
  const markedCol = live && point ? point.index : null

  return (
    <ScrollRegion label="Years to milestone" focusable={false}>
      <table
        ref={table}
        className={`${styles.milestoneTable} ${styles.matrixTable}${className ? ` ${className}` : ''}`}
        style={{ '--cols': shown.length } as CSSProperties}
        role="grid"
        aria-label="Years to milestone, one row per path"
        onKeyDown={(event) => moveFocus(event, shown, rows.length, table.current)}
        onMouseLeave={onLeave}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) onLeave()
        }}
      >
        <GridHead
          shown={shown}
          milestones={milestones}
          reached={reached}
          markedCol={markedCol}
          bare={narrow && !keepSign && shown.length > MAX_WITH_SIGN}
        />
        <tbody>
          {rows.map((row, r) => (
            <tr key={row.id}>
              <RowHead row={row} isPlanShown={plan !== null && row.id === plan.id} marked={markedRow === row.id} />
              {shown.map((c) => (
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
