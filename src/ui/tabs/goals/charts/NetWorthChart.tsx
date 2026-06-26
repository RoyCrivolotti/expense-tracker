import { memo, useCallback, useMemo, useState, type ReactNode } from 'react'
import type { GoalScenario } from '../../../../types'
import type { NewGoalScenario } from '../../../../data/dataSource'
import type { ProjectionParams } from '../../../../engine'
import { MILESTONE_CENTS, projectNetWorth, purchaseYearBreakdown, scenarioToParams } from '../../../../engine'
import { Card } from '../../../components/primitives'
import { LinearChart, type ChartSeries } from '../../../charts/LinearChart'
import { ChartLegend, type LegendItem } from '../../../charts/ChartLegend'
import type { TooltipLine } from '../../../charts/ChartTooltip'
import { sparseLabels } from '../../../charts/linearScale'
import { formatEuroShort } from '../chartTheme'
import {
  ScenarioSeriesLegend,
  type ScenarioLegendBreakdown,
  type ScenarioLegendItem,
} from './ScenarioSeriesLegend'
import styles from '../goals.module.css'

interface ScenarioLine {
  id: string
  name: string
  color: string
  dashed: boolean
  params: ProjectionParams
}

function scenarioLines(
  saved: GoalScenario[],
  draft: NewGoalScenario,
  activeId: number | null,
  dirty: boolean,
): ScenarioLine[] {
  const lines: ScenarioLine[] = saved
    .filter((s) => s.id !== activeId || dirty)
    .map((s) => ({
      id: `saved-${s.id}`,
      name: s.name,
      color: s.color,
      dashed: false,
      params: scenarioToParams(s),
    }))
  lines.push({
    id: 'draft',
    name: `${draft.name} (editing)`,
    color: draft.color,
    dashed: true,
    params: scenarioToParams({ ...draft, id: 0 }),
  })
  return lines
}

function buildSeries(
  lines: ScenarioLine[],
): { years: number[]; series: ChartSeries[]; names: string[] } {
  const projected = lines.map((line) => ({
    line,
    points: projectNetWorth(line.params),
  }))
  const yearSet = new Set<number>()
  projected.forEach(({ points }) => points.forEach((p) => yearSet.add(p.year)))
  const years = [...yearSet].sort((a, b) => a - b)
  const series: ChartSeries[] = projected.map(({ line, points }) => {
    const byYear = new Map(points.map((p) => [p.year, p.investedCents]))
    return {
      id: line.id,
      color: line.color,
      values: years.map((y) => byYear.get(y) ?? 0),
      dashed: line.dashed,
      ...(line.id === 'draft' ? { width: 2.5 } : {}),
    }
  })
  return { years, series, names: lines.map((l) => l.name) }
}

function purchaseMarkerIndices(lines: ScenarioLine[], years: number[]): { yearIndex: number }[] {
  const indices = new Set<number>()
  for (const line of lines) {
    const purchaseYear = line.params.housePurchaseYear
    if (purchaseYear == null) continue
    const idx = years.indexOf(purchaseYear)
    if (idx >= 0) indices.add(idx)
  }
  return [...indices].sort((a, b) => a - b).map((yearIndex) => ({ yearIndex }))
}

function PortfolioLegend({
  isHero,
  staticLegend,
  legendItems,
  activeYear,
  breakdowns,
  yearZeroHint,
}: {
  isHero: boolean
  staticLegend: LegendItem[]
  legendItems: ScenarioLegendItem[]
  activeYear: number | null
  breakdowns: ScenarioLegendBreakdown[]
  yearZeroHint: boolean
}) {
  if (isHero) {
    return (
      <ScenarioSeriesLegend
        items={legendItems}
        activeYear={activeYear}
        breakdowns={breakdowns}
        yearZeroHint={yearZeroHint}
      />
    )
  }
  return <ChartLegend items={staticLegend} variant="stack" />
}

function useChartLegendState(
  lines: ScenarioLine[],
  series: ChartSeries[],
  names: string[],
  years: number[],
  activeIndex: number | null,
) {
  const activeYear = activeIndex != null ? years[activeIndex] ?? null : null
  const legendItems: ScenarioLegendItem[] = useMemo(
    () =>
      series.map((s, idx) => ({
        label: names[idx] ?? s.id,
        color: s.color,
        ...(s.dashed ? { dashed: true as const } : {}),
        valueCents: activeIndex != null ? s.values[activeIndex] ?? 0 : null,
      })),
    [series, names, activeIndex],
  )
  const breakdowns: ScenarioLegendBreakdown[] = useMemo(() => {
    if (activeYear == null) return []
    return lines.flatMap((line) => {
      const breakdown = purchaseYearBreakdown(line.params, activeYear)
      if (!breakdown) return []
      return [
        {
          label: line.name,
          color: line.color,
          ...(line.dashed ? { dashed: true as const } : {}),
          breakdown,
        },
      ]
    })
  }, [activeYear, lines])
  const yearZeroHint = useMemo(() => {
    if (activeYear !== 0 || breakdowns.length > 0) return false
    return lines.some((line) => line.params.housePurchaseYear === 0)
  }, [activeYear, breakdowns.length, lines])

  return { activeYear, legendItems, breakdowns, yearZeroHint }
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
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const onActiveIndexChange = useCallback((index: number | null) => {
    setActiveIndex(index)
  }, [])

  const lines = useMemo(
    () => scenarioLines(scenarios, draft, activeId, dirty),
    [scenarios, draft, activeId, dirty],
  )
  const { years, series, names } = useMemo(() => buildSeries(lines), [lines])
  const markerYears = useMemo(() => purchaseMarkerIndices(lines, years), [lines, years])
  const refLines = useMemo(() => MILESTONE_CENTS.filter((m) => m <= 100_000_000), [])
  const labels = useMemo(() => sparseLabels(years, 5), [years])
  const isHero = variant === 'hero'
  const staticLegend: LegendItem[] = useMemo(
    () =>
      series.map((s, idx) => ({
        label: names[idx] ?? s.id,
        color: s.color,
      })),
    [series, names],
  )
  const { activeYear, legendItems, breakdowns, yearZeroHint } = useChartLegendState(
    lines,
    series,
    names,
    years,
    activeIndex,
  )

  const tooltip = (i: number): { title: string; lines: TooltipLine[] } => {
    const year = years[i] ?? i
    const lines: TooltipLine[] = series.map((s, idx) => ({
      label: names[idx] ?? s.id,
      value: formatEuroShort(s.values[i] ?? 0),
      tone: 'neutral',
    }))
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
          withdrawn — select a year on the chart for values and the purchase breakdown.
          Dashed vertical marks show purchase years.
        </p>
      )}
      <LinearChart
        height={isHero ? 230 : 210}
        series={series}
        xLabels={labels}
        refLines={refLines}
        markerYears={isHero ? markerYears : []}
        formatValue={formatEuroShort}
        ariaLabel="Invested portfolio projection by year"
        tooltip={tooltip}
        tooltipMode={isHero ? 'hidden' : 'full'}
        {...(isHero ? { onActiveIndexChange } : {})}
      />
      <PortfolioLegend
        isHero={isHero}
        staticLegend={staticLegend}
        legendItems={legendItems}
        activeYear={activeYear}
        breakdowns={breakdowns}
        yearZeroHint={yearZeroHint}
      />
      {footer != null ? <div className={styles.chartFooter}>{footer}</div> : null}
    </Card>
  )
}

export const NetWorthChart = memo(NetWorthChartImpl)
