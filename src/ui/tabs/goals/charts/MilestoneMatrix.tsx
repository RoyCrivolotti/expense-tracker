import { memo, useMemo } from 'react'
import type { GoalScenario } from '../../../../types'
import type { NewGoalScenario } from '../../../../data/dataSource'
import {
  MILESTONE_CENTS,
  scenarioToParams,
  yearsToTargetFromProjection,
} from '../../../../engine'
import { ChartShell } from './ChartShell'
import { formatEuroShort } from '../chartTheme'
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
  name: string
  color: string
  cells: (number | null)[]
}

function buildRows(scenarios: GoalScenario[], draft: NewGoalScenario): Row[] {
  const all = [
    ...scenarios.map((s) => ({ name: shortName(s.name), color: s.color, params: scenarioToParams(s) })),
    {
      name: `${shortName(draft.name)} (editing)`,
      color: draft.color,
      params: scenarioToParams({ ...draft, id: 0 }),
    },
  ]
  return all.map(({ name, color, params }) => ({
    name,
    color,
    cells: MILESTONE_CENTS.map((m) => yearsToTargetFromProjection(params, m, false)),
  }))
}

function MilestoneMatrixImpl({
  scenarios,
  draft,
  embedded = false,
}: {
  scenarios: GoalScenario[]
  draft: NewGoalScenario
  embedded?: boolean
}) {
  const rows = useMemo(() => buildRows(scenarios, draft), [scenarios, draft])

  return (
    <ChartShell embedded={embedded}>
      <h3 className={styles.chartTitle}>Years to milestone</h3>
      <p className={styles.chartHint}>Invested portfolio only — same matrix as finance-review chart 20.</p>
      <div className={styles.milestoneScroll}>
        <table className={styles.milestoneTable}>
          <thead>
            <tr>
              <th className={styles.milestoneScenarioHead}>Scenario</th>
              {MILESTONE_CENTS.map((m) => (
                <th key={m} className={styles.milestoneHead}>
                  {formatEuroShort(m)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name}>
                <td className={styles.milestoneScenarioCell}>
                  <span
                    className={styles.swatch}
                    style={{ background: row.color, display: 'inline-block', marginRight: 6 }}
                  />
                  {row.name}
                </td>
                {row.cells.map((years, i) => (
                  <td
                    key={MILESTONE_CENTS[i]}
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
    </ChartShell>
  )
}

export const MilestoneMatrix = memo(MilestoneMatrixImpl)
