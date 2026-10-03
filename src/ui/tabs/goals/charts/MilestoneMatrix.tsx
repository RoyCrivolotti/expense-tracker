import { memo, useMemo } from 'react'
import { useAssumedInflation } from '../../..//hooks/assumedInflationContext'
import type { GoalScenario, Milestone } from '../../../../types'
import type { PlanFromToday } from '../../../../engine'
import type { NewGoalScenario } from '../../../../data/dataSource'
import {
  milestoneName,
  scenarioToParams,
  shortMonthYearLabel,
  yearsToTargetFromProjection,
} from '../../../../engine'
import { ChartShell } from './ChartShell'
import { cellColors } from './matrixColors'
import { formatMoneyShort } from '../chartTheme'
import { useMoneyFormat } from '../../../hooks/moneyFormatContext'
import { tableName } from '../scenarioNames'
import { ScrollRegion } from './ScrollRegion'
import { scenarioInk } from '../scenarioInk'
import styles from '../goals.module.css'

/**
 * "Not reached" is "not within this scenario's horizon", which is what the search covers, so it is
 * named by that horizon: a flat "40+" said a milestone was more than 40 years off when it was 31
 * years off on a 30 year plan, and showed it was reached in 32 once the horizon was 45.
 */
function cellLabel(years: number | null, horizonYears: number): string {
  if (years === null) return `${horizonYears}+`
  if (years === 0) return 'now'
  return `${years}y`
}

interface Row {
  /** Scenario id, or 'draft'; names are not unique, so they cannot key a row. */
  id: string
  name: string
  color: string
  /** How far the search for each milestone went. */
  horizonYears: number
  cells: (number | null)[]
}

function buildRows(
  scenarios: GoalScenario[],
  draft: NewGoalScenario,
  milestones: Milestone[],
  inflationRate: number,
  includeDraft: boolean,
  fromToday: PlanFromToday | null,
): Row[] {
  const names = scenarios.map((s) => s.name)
  const all = [
    ...scenarios.flatMap((s) => [
      { id: String(s.id), name: tableName(s.name, names), color: s.color, params: scenarioToParams(s, inflationRate) },
      // The plan from the latest check-in, under the plan: its years count from the check-in.
      ...(fromToday && s.id === fromToday.scenario.id
        ? [{ id: 'from-today', name: `${tableName(s.name, names)}, from today`, color: s.color, params: scenarioToParams(fromToday.scenario, inflationRate) }]
        : []),
    ]),
    // Only when the draft is a line of its own: a loaded scenario with no edits is drawn as
    // the draft on the chart, and a row for both would be the same plan twice.
    ...(includeDraft
      ? [
          {
            id: 'draft',
            name: `${tableName(draft.name, names)} (editing)`,
            color: draft.color,
            params: scenarioToParams({ ...draft, id: 0 }, inflationRate),
          },
        ]
      : []),
  ]
  return all.map(({ id, name, color, params }) => ({
    id,
    name,
    color,
    horizonYears: params.horizonYears,
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
    () => buildRows(scenarios, draft, milestones, inflationRate, includeDraft, fromToday),
    [scenarios, draft, milestones, inflationRate, includeDraft, fromToday],
  )

  return (
    <ChartShell embedded={embedded}>
      <h3 className={styles.chartTitle}>Years to milestone</h3>
      <p className={styles.chartHint}>
        Invested portfolio only. Edit the list in Assumptions.
        {fromToday ? ' "From today" counts years from your latest check-in.' : ''}
      </p>
      {milestones.length === 0 ? (
        <p className={styles.chartHint}>No milestones set.</p>
      ) : (
      <ScrollRegion label="Years to milestone">
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
                <th scope="row" className={styles.milestoneScenarioCell} title={row.name}>
                  <span className={styles.milestoneScenarioNameRow}>
                    <span className={styles.swatch} style={{ background: scenarioInk(row.color) }} />
                    <span className={styles.milestoneScenarioName}>{row.name}</span>
                  </span>
                </th>
                {row.cells.map((years, i) => (
                  <td
                    key={milestones[i]?.amountCents ?? i}
                    className={styles.milestoneCell}
                    style={cellColors(years)}
                  >
                    {cellLabel(years, row.horizonYears)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollRegion>
      )}
    </ChartShell>
  )
}

export const MilestoneMatrix = memo(MilestoneMatrixImpl)
