import type { GoalScenario } from '../../../../types'
import type { NewGoalScenario } from '../../../../data/dataSource'
import {
  MILESTONE_CENTS,
  scenarioToParams,
  yearsToTargetFromProjection,
} from '../../../../engine'
import { Card } from '../../../components/primitives'
import { formatEuroShort } from '../chartTheme'
import styles from '../goals.module.css'

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
    ...scenarios.map((s) => ({ name: s.name, color: s.color, params: scenarioToParams(s) })),
    {
      name: `${draft.name} (editing)`,
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

export function MilestoneMatrix({
  scenarios,
  draft,
}: {
  scenarios: GoalScenario[]
  draft: NewGoalScenario
}) {
  const rows = buildRows(scenarios, draft)

  return (
    <Card className={styles.chartCard}>
      <h3 className={styles.chartTitle}>Years to milestone</h3>
      <p className={styles.chartHint}>Invested portfolio only — same matrix as finance-review chart 20.</p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '0.35rem' }}>Scenario</th>
              {MILESTONE_CENTS.map((m) => (
                <th key={m} style={{ padding: '0.35rem', textAlign: 'center' }}>
                  {formatEuroShort(m)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name}>
                <td style={{ padding: '0.35rem', whiteSpace: 'nowrap' }}>
                  <span className={styles.swatch} style={{ background: row.color, display: 'inline-block', marginRight: 6 }} />
                  {row.name}
                </td>
                {row.cells.map((years, i) => (
                  <td
                    key={MILESTONE_CENTS[i]}
                    style={{
                      padding: '0.35rem',
                      textAlign: 'center',
                      background: cellColor(years),
                      color: years !== null && years > 12 ? '#fff' : '#111',
                      fontWeight: 600,
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
    </Card>
  )
}
