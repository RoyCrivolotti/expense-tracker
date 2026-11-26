import type { CSSProperties } from 'react'
import type { Milestone } from '../../../../types'
import { milestoneName, shortMonthYearLabel } from '../../../../engine'
import { formatMoneyShort } from '../chartTheme'
import { useMoneyFormat } from '../../../hooks/moneyFormatContext'
import { scenarioInk } from '../scenarioInk'
import { cellText, type YearsUnit } from './milestoneTable'
import { gapLabel, type GapText } from './milestoneGaps'
import { tintPercent, type MilestoneRow } from './milestoneModel'
import styles from '../goals.module.css'

export function MilestoneHead({
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
        className={name ? `${styles.milestoneHeadAmount} ${styles.milestoneHeadAmountSub}` : styles.milestoneHeadAmount}
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

function boxClass(years: number | null): string {
  if (years === 0) return `${styles.matrixBox} ${styles.matrixDone}`
  if (years === null) return `${styles.matrixBox} ${styles.matrixBeyond}`
  return `${styles.matrixBox} ${styles.matrixTint}`
}

/** A blank line holds its height with a no-break space, so the cells of a row stay level. */
function GapLine({ label }: { label: GapText | null }) {
  return (
    <span
      className={label?.sooner ? `${styles.matrixGap} ${styles.matrixSooner}` : styles.matrixGap}
      aria-hidden="true"
    >
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

export function Cell({
  row,
  rowIndex,
  colIndex,
  longest,
  unit,
  plan,
  gaps,
  sentence,
  tabStop,
  crosshair,
  onPoint,
}: CellProps) {
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

export function RowHead({ row, isPlanShown, marked }: { row: MilestoneRow; isPlanShown: boolean; marked: boolean }) {
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

/** The head row: a column per milestone shown, the one the reader is on marked. */
export function GridHead({
  shown,
  milestones,
  reached,
  markedCol,
  bare,
}: {
  shown: number[]
  milestones: Milestone[]
  reached: Map<number, string>
  markedCol: number | null
  bare: boolean
}) {
  return (
    <thead>
      <tr>
        <th className={styles.milestoneScenarioHead}>Scenario</th>
        {shown.map((i) => (
          <MilestoneHead
            key={milestones[i]?.amountCents ?? i}
            milestone={milestones[i] as Milestone}
            reachedOn={reached.get(milestones[i]?.amountCents ?? -1)}
            marked={markedCol === i}
            bare={bare}
          />
        ))}
      </tr>
    </thead>
  )
}
