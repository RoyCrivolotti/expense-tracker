import { memo, useMemo, type ReactNode } from 'react'
import type { GoalScenario } from '../../../../types'
import type { NewGoalScenario } from '../../../../data/dataSource'
import { MILESTONE_CENTS, projectNetWorth, purchaseYearBreakdown, scenarioToParams } from '../../../../engine'
import { Card } from '../../../components/primitives'
import { LinearChart, type ChartSeries } from '../../../charts/LinearChart'
import { ChartLegend, type LegendItem } from '../../../charts/ChartLegend'
import type { TooltipLine } from '../../../charts/ChartTooltip'
import { sparseLabels } from '../../../charts/linearScale'
import { formatEuroShort } from '../chartTheme'
import { purchaseBreakdownTooltipLines } from '../purchaseTooltip'
import styles from '../goals.module.css'

interface RawLine {
  id: string
  name: string
  color: string
  dashed: boolean
  points: { year: number; investedCents: number }[]
}

function rawLines(
  saved: GoalScenario[],
  draft: NewGoalScenario,
  activeId: number | null,
  dirty: boolean,
): RawLine[] {
  // The active scenario is normally represented by the live "(editing)" line, so
  // drop its saved copy to avoid drawing the same plan twice. Keep it while the
  // edit is dirty so the saved baseline stays visible to compare against.
  const lines: RawLine[] = saved
    .filter((s) => s.id !== activeId || dirty)
    .map((s) => ({
      id: `saved-${s.id}`,
      name: s.name,
      color: s.color,
      dashed: false,
      points: projectNetWorth(scenarioToParams(s)),
    }))
  lines.push({
    id: 'draft',
    name: `${draft.name} (editing)`,
    color: draft.color,
    dashed: true,
    points: projectNetWorth(scenarioToParams({ ...draft, id: 0 })),
  })
  return lines
}

function buildSeries(
  saved: GoalScenario[],
  draft: NewGoalScenario,
  activeId: number | null,
  dirty: boolean,
): { years: number[]; series: ChartSeries[]; names: string[] } {
  const lines = rawLines(saved, draft, activeId, dirty)
  const yearSet = new Set<number>()
  lines.forEach((l) => l.points.forEach((p) => yearSet.add(p.year)))
  const years = [...yearSet].sort((a, b) => a - b)
  const series: ChartSeries[] = lines.map((l) => {
    const byYear = new Map(l.points.map((p) => [p.year, p.investedCents]))
    return {
      id: l.id,
      color: l.color,
      values: years.map((y) => byYear.get(y) ?? 0),
      dashed: l.dashed,
      ...(l.id === 'draft' ? { width: 2.5 } : {}),
    }
  })
  return { years, series, names: lines.map((l) => l.name) }
}

function NetWorthChartImpl({
  scenarios,
  draft,
  activeId = null,
  dirty = false,
  variant = 'default',
  footer,
}: {
  scenarios: GoalScenario[]
  draft: NewGoalScenario
  activeId?: number | null
  dirty?: boolean
  variant?: 'default' | 'hero'
  footer?: ReactNode
}) {
  const { years, series, names } = useMemo(
    () => buildSeries(scenarios, draft, activeId, dirty),
    [scenarios, draft, activeId, dirty],
  )
  const refLines = useMemo(() => MILESTONE_CENTS.filter((m) => m <= 100_000_000), [])
  const labels = useMemo(() => sparseLabels(years, 5), [years])
  const legend: LegendItem[] = series.map((s, idx) => ({
    label: names[idx] ?? s.id,
    color: s.color,
  }))
  const isHero = variant === 'hero'

  const tooltip = (i: number): { title: string; lines: TooltipLine[] } => {
    const year = years[i] ?? i
    const lines: TooltipLine[] = series.map((s, idx) => ({
      label: names[idx] ?? s.id,
      value: formatEuroShort(s.values[i] ?? 0),
      tone: 'neutral',
    }))
    const breakdown = purchaseYearBreakdown(scenarioToParams({ ...draft, id: 0 }), year)
    if (breakdown) lines.push(...purchaseBreakdownTooltipLines(breakdown))
    return { title: `Year ${year}`, lines }
  }

  return (
    <Card className={isHero ? `${styles.chartCard} ${styles.heroChart}` : styles.chartCard}>
      <h3 className={styles.chartTitle}>Invested portfolio projection</h3>
      {!isHero ? (
        <p className={styles.chartHint}>
          Compare saved scenarios plus your live edits. At a purchase year, return and
          contributions apply before the down payment is withdrawn — hover that year for
          the breakdown.
        </p>
      ) : (
        <p className={styles.chartHint}>
          At a purchase year, return and contributions apply before the down payment is
          withdrawn — hover that year for the breakdown.
        </p>
      )}
      <LinearChart
        height={isHero ? 230 : 210}
        series={series}
        xLabels={labels}
        refLines={refLines}
        formatValue={formatEuroShort}
        ariaLabel="Invested portfolio projection by year"
        tooltip={tooltip}
      />
      <ChartLegend items={legend} variant="stack" />
      {footer != null ? <div className={styles.chartFooter}>{footer}</div> : null}
    </Card>
  )
}

export const NetWorthChart = memo(NetWorthChartImpl)
