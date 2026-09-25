import { memo, useMemo } from 'react'
import { useAssumedInflation } from '../../..//hooks/assumedInflationContext'
import type { GoalScenario, Milestone } from '../../../../types'
import type { NewGoalScenario } from '../../../../data/dataSource'
import {
  milestoneName,
  scenarioToParams,
  shortMonthYearLabel,
  yearsToTargetFromProjection,
} from '../../../../engine'
import { ChartShell } from './ChartShell'
import { formatMoneyShort } from '../chartTheme'
import { useMoneyFormat } from '../../../hooks/moneyFormatContext'
import styles from '../goals.module.css'

function shortName(name: string): string {
  const colon = name.indexOf(':')
  return colon >= 0 ? name.slice(0, colon).trim() : name
}

function cellColor(years: number | null): string {
  if (years === null) return '#fecaca'
  if (years === 0) return '#166534'
  if (years <= 10) return '#86efac'
  if (years <= 20) return '#fde047'
  if (years <= 30) return '#fdba74'
  return '#f87171'
}

function cellLabel(years: number | null): string {
  if (years === null) return '40+'
  if (years === 0) return 'now'
  return `${years}y`
}

interface Row {
  /** Scenario id, or 'draft'; names are not unique, so they cannot key a row. */
  id: string
  name: string
  color: string
  cells: (number | null)[]
}

function buildRows(
  scenarios: GoalScenario[],
  draft: NewGoalScenario,
  milestones: Milestone[],
  inflationRate: number,
): Row[] {
  const all = [
    ...scenarios.map((s) => ({ id: String(s.id), name: shortName(s.name), color: s.color, params: scenarioToParams(s, inflationRate) })),
    {
      id: 'draft',
      name: `${shortName(draft.name)} (editing)`,
      color: draft.color,
      params: scenarioToParams({ ...draft, id: 0 }, inflationRate),
    },
  ]
  return all.map(({ id, name, color, params }) => ({
    id,
    name,
    color,
    cells: milestones.map((m) => yearsToTargetFromProjection(params, m.amountCents, false)),
  }))
}

/**
 * One stacked column header: optional name, then the amount, then a short
 * reached tick. Columns are narrow, so the long forms ("3rd goal (phase 1)",
 * "reached by 2026-07-29") live in the tooltip instead of on screen.
 */
function MilestoneHead({
  milestone,
  reachedOn,
}: {
  milestone: Milestone
  reachedOn: string | undefined
}) {
  const format = useMoneyFormat()
  const amount = formatMoneyShort(milestone.amountCents, format)
  const name = milestoneName(milestone)
  // "by", not "on": the crossing happened somewhere between two check-ins.
  const tooltip = [name, amount, reachedOn ? `reached by ${reachedOn}` : null]
    .filter((part) => part !== null)
    .join(' · ')

  return (
    <th
      className={
        reachedOn === undefined
          ? styles.milestoneHead
          : `${styles.milestoneHead} ${styles.milestoneHeadReached}`
      }
      scope="col"
      title={tooltip}
    >
      {name ? <span className={styles.milestoneHeadName}>{name}</span> : null}
      <span
        className={
          name ? `${styles.milestoneHeadAmount} ${styles.milestoneHeadAmountSub}` : styles.milestoneHeadAmount
        }
      >
        {amount}
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

function MilestoneMatrixImpl({
  scenarios,
  draft,
  milestones,
  reached,
  embedded = false,
}: {
  scenarios: GoalScenario[]
  draft: NewGoalScenario
  milestones: Milestone[]
  /** amountCents -> date first observed at or above, from check-in history. */
  reached: Map<number, string>
  embedded?: boolean
}) {
  const inflationRate = useAssumedInflation()
  const rows = useMemo(
    () => buildRows(scenarios, draft, milestones, inflationRate),
    [scenarios, draft, milestones, inflationRate],
  )

  return (
    <ChartShell embedded={embedded}>
      <h3 className={styles.chartTitle}>Years to milestone</h3>
      <p className={styles.chartHint}>
        Invested portfolio only. Edit the list under Settings → Milestones.
      </p>
      {milestones.length === 0 ? (
        <p className={styles.chartHint}>No milestones set.</p>
      ) : (
      <div className={styles.milestoneScroll}>
        <table className={styles.milestoneTable}>
          <thead>
            <tr>
              <th className={styles.milestoneScenarioHead}>Scenario</th>
              {milestones.map((m) => (
                <MilestoneHead
                  key={m.amountCents}
                  milestone={m}
                  reachedOn={reached.get(m.amountCents)}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className={styles.milestoneScenarioCell}>
                  <span
                    className={styles.swatch}
                    style={{ background: row.color, display: 'inline-block', marginRight: 6 }}
                  />
                  {row.name}
                </td>
                {row.cells.map((years, i) => (
                  <td
                    key={milestones[i]?.amountCents ?? i}
                    className={styles.milestoneCell}
                    style={{
                      background: cellColor(years),
                      color: years !== null && years > 12 ? '#fff' : '#111',
                    }}
                  >
                    {cellLabel(years)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </ChartShell>
  )
}

export const MilestoneMatrix = memo(MilestoneMatrixImpl)
