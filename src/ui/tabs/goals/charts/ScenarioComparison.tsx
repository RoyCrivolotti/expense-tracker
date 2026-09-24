import { memo, useMemo } from 'react'
import type { GoalScenario } from '../../../../types'
import type { NewGoalScenario } from '../../../../data/dataSource'
import { ChartShell } from './ChartShell'
import { comparisonRows, type ComparisonRow } from './comparisonRows'
import { useMoneyFormat } from '../../../hooks/moneyFormatContext'
import styles from '../goals.module.css'

type Column = keyof Omit<ComparisonRow, 'key' | 'name' | 'color' | 'horizonYears'>

const COLUMNS: { key: Column; label: string }[] = [
  { key: 'fi', label: 'FI' },
  { key: 'netWorth', label: 'Net worth' },
  { key: 'invested', label: 'Invested' },
  { key: 'house', label: 'House' },
  { key: 'monthly', label: 'Monthly' },
]

/** Cells hold only what the header does not say; the horizon rides in the hint when shared. */
function cell(row: ComparisonRow, key: Column, sharedHorizon: boolean): string {
  const value = row[key]
  if (sharedHorizon || (key !== 'netWorth' && key !== 'invested')) return value
  return `${value} (${row.horizonYears}y)`
}

function ScenarioComparisonImpl({
  scenarios,
  draft,
  embedded = false,
}: {
  scenarios: GoalScenario[]
  draft: NewGoalScenario
  embedded?: boolean
}) {
  const format = useMoneyFormat()
  const rows = useMemo(() => comparisonRows(scenarios, draft, format), [scenarios, draft, format])
  const sharedHorizon = rows.every((r) => r.horizonYears === rows[0]?.horizonYears)
  const horizon = sharedHorizon && rows[0] ? ` after ${rows[0].horizonYears} years` : ' at each path’s horizon'

  return (
    <ChartShell embedded={embedded}>
      <h3 className={styles.chartTitle}>Scenarios side by side</h3>
      <p className={styles.chartHint}>
        Net worth and invested are{horizon}, in today's money; FI and the house purchase are
        counted in years from the plan start; monthly is what each path invests.
      </p>
      <div className={styles.milestoneScroll}>
        <table className={styles.milestoneTable}>
          <thead>
            <tr>
              <th className={styles.milestoneScenarioHead}>Scenario</th>
              {COLUMNS.map((c) => (
                <th key={c.key} className={styles.compareHead} scope="col">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td className={styles.milestoneScenarioCell}>
                  <span
                    className={styles.swatch}
                    style={{ background: row.color, display: 'inline-block', marginRight: 6 }}
                  />
                  {row.name}
                </td>
                {COLUMNS.map((c) => (
                  <td key={c.key} className={styles.compareCell}>
                    {cell(row, c.key, sharedHorizon)}
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

export const ScenarioComparison = memo(ScenarioComparisonImpl)
