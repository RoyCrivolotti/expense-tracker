import { memo, useMemo, useState } from 'react'
import type { GoalScenario } from '../../../../types'
import type { NewGoalScenario } from '../../../../data/dataSource'
import { SegmentedControl } from '../../../components/SegmentedControl'
import { ChartShell } from './ChartShell'
import { comparisonRows, type ComparisonRow } from './comparisonRows'
import { HERO_WINDOWS, type HeroWindowKey } from './heroWindow'
import { useAssumedInflation } from '../../../hooks/assumedInflationContext'
import { useMoneyFormat } from '../../../hooks/moneyFormatContext'
import styles from '../goals.module.css'
import progressStyles from '../progress.module.css'

type Column = keyof Omit<ComparisonRow, 'key' | 'name' | 'color' | 'horizonYears' | 'atYear'>

/**
 * The same years the hero chart offers, so the table can be read at the window the chart
 * is set to. Only windows inside at least one path are offered, and "Horizon" is the end
 * of each, as the table always read before.
 */
function yearOptions(maxHorizon: number): { value: HeroWindowKey; label: string }[] {
  return HERO_WINDOWS.filter((w) => w.years === null || w.years < maxHorizon).map((w) => ({
    value: w.value,
    label: w.years === null ? 'Horizon' : w.label,
  }))
}

const COLUMNS: { key: Column; label: string }[] = [
  { key: 'fi', label: 'FI' },
  { key: 'netWorth', label: 'Net worth' },
  { key: 'invested', label: 'Invested' },
  { key: 'house', label: 'House' },
  { key: 'monthly', label: 'Monthly' },
]

/** Cells hold only what the header does not say; the year rides in the hint when shared. */
function cell(row: ComparisonRow, key: Column, sharedYear: boolean): string {
  const value = row[key]
  if (sharedYear || (key !== 'netWorth' && key !== 'invested')) return value
  return `${value} (${row.atYear}y)`
}

/** Where net worth and invested are read, for the hint. */
function readAt(rows: ComparisonRow[], year: number | null): string {
  const shared = rows.every((r) => r.atYear === rows[0]?.atYear)
  if (shared && rows[0]) return ` after ${rows[0].atYear} years`
  return year === null ? ' at each path’s horizon' : ` after ${year} years, or at a path’s horizon when it is shorter`
}

function ScenarioComparisonImpl({
  scenarios,
  draft,
  includeDraft = true,
  embedded = false,
}: {
  scenarios: GoalScenario[]
  draft: NewGoalScenario
  /** False when the draft is a loaded scenario with no edits, which already has its row. */
  includeDraft?: boolean
  embedded?: boolean
}) {
  const format = useMoneyFormat()
  const inflationRate = useAssumedInflation()
  const [selectedWindow, setSelectedWindow] = useState<HeroWindowKey>('all')
  const maxHorizon = Math.max(draft.horizonYears, ...scenarios.map((s) => s.horizonYears))
  const options = yearOptions(maxHorizon)
  // A window the horizons no longer reach falls back to the horizon, as the hero chart does.
  const chosen = options.some((o) => o.value === selectedWindow) ? selectedWindow : 'all'
  const year = HERO_WINDOWS.find((w) => w.value === chosen)?.years ?? null
  const rows = useMemo(
    () => comparisonRows(scenarios, draft, format, inflationRate, includeDraft, year),
    [scenarios, draft, format, inflationRate, includeDraft, year],
  )
  const sharedYear = rows.every((r) => r.atYear === rows[0]?.atYear)

  return (
    <ChartShell embedded={embedded}>
      <div className={progressStyles.chartHeaderRow}>
        <h3 className={styles.chartTitle}>Scenarios side by side</h3>
        <SegmentedControl
          options={options}
          value={chosen}
          onChange={setSelectedWindow}
          ariaLabel="Comparison year"
          layout="compact"
        />
      </div>
      <p className={styles.chartHint}>
        Net worth and invested are{readAt(rows, year)}, in today's money; FI and the house purchase are
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
                <td className={styles.milestoneScenarioCell} title={row.name}>
                  <span className={styles.milestoneScenarioNameRow}>
                    <span className={styles.swatch} style={{ background: row.color }} />
                    <span className={styles.milestoneScenarioName}>{row.name}</span>
                  </span>
                </td>
                {COLUMNS.map((c) => (
                  <td key={c.key} className={styles.compareCell}>
                    {cell(row, c.key, sharedYear)}
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
