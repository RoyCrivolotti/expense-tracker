import { memo, useMemo, useState } from 'react'
import type { GoalScenario } from '../../../../types'
import type { NewGoalScenario } from '../../../../data/dataSource'
import type { PlanFromToday } from '../../../../engine'
import { SegmentedControl } from '../../../components/SegmentedControl'
import { ChartShell } from './ChartShell'
import { comparisonRows, type ComparisonRow } from './comparisonRows'
import { comparisonOrigin, offsetOf } from './comparisonCalendar'
import { calendarHint, sameDayHint } from './comparisonHint'
import { HERO_WINDOWS, type HeroWindowKey } from './heroWindow'
import { useAssumedInflation } from '../../../hooks/assumedInflationContext'
import { useMoneyFormat } from '../../../hooks/moneyFormatContext'
import { ScrollRegion } from './ScrollRegion'
import { scenarioInk } from '../scenarioInk'
import styles from '../goals.module.css'
import progressStyles from '../progress.module.css'

type Column = keyof Omit<ComparisonRow, 'key' | 'name' | 'color' | 'horizonYears' | 'atYear' | 'monthlyLater' | 'netWorthCents' | 'investedCents' | 'ended' | 'everyReaches'>

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

function ScenarioComparisonImpl({
  scenarios,
  draft,
  includeDraft = true,
  fromToday = null,
  embedded = false,
}: {
  scenarios: GoalScenario[]
  draft: NewGoalScenario
  /** False when the draft is a loaded scenario with no edits, which already has its row. */
  includeDraft?: boolean
  /** The plan restarted from the latest check-in, listed under the plan. */
  fromToday?: PlanFromToday | null | undefined
  embedded?: boolean
}) {
  const format = useMoneyFormat()
  const inflationRate = useAssumedInflation()
  const [window, setWindow] = useState<HeroWindowKey>('all')
  const origin = comparisonOrigin(scenarios, draft)
  // On a shared calendar a window is years from the earliest start, so it may reach as far as the latest end.
  const reach = (s: NewGoalScenario) => s.horizonYears + (origin === null ? 0 : offsetOf(s, origin))
  const maxHorizon = Math.max(reach(draft), ...scenarios.map(reach))
  const options = yearOptions(maxHorizon)
  // A window the horizons no longer reach falls back to the horizon, as the hero chart does.
  const chosen = options.some((o) => o.value === window) ? window : 'all'
  const year = HERO_WINDOWS.find((w) => w.value === chosen)?.years ?? null
  const rows = useMemo(
    () => comparisonRows(scenarios, draft, format, inflationRate, includeDraft, year, fromToday),
    [scenarios, draft, format, inflationRate, includeDraft, year, fromToday],
  )
  const sharedYear = rows.every((r) => r.atYear === rows[0]?.atYear)
  const hint = { rows, scenarios, draft, includeDraft, year, fromToday, format }

  return (
    <ChartShell embedded={embedded}>
      <div className={progressStyles.chartHeaderRow}>
        <h3 className={styles.chartTitle}>Scenarios side by side</h3>
        <SegmentedControl
          options={options}
          value={chosen}
          onChange={setWindow}
          ariaLabel="Comparison year"
          layout="compact"
        />
      </div>
      <p className={styles.chartHint}>
        {origin === null ? sameDayHint(hint) : calendarHint(hint, origin)}
      </p>
      <ScrollRegion label="Scenarios side by side">
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
                <th scope="row" className={styles.milestoneScenarioCell} title={row.name}>
                  <span className={styles.milestoneScenarioNameRow}>
                    <span className={styles.swatch} style={{ background: scenarioInk(row.color) }} />
                    <span className={styles.milestoneScenarioName}>{row.name}</span>
                  </span>
                </th>
                {COLUMNS.map((c) => (
                  <td key={c.key} className={styles.compareCell}>
                    {cell(row, c.key, sharedYear)}
                    {c.key === 'monthly' && row.monthlyLater ? (
                      <span className={styles.compareLater}>then {row.monthlyLater}</span>
                    ) : null}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollRegion>
    </ChartShell>
  )
}

export const ScenarioComparison = memo(ScenarioComparisonImpl)
