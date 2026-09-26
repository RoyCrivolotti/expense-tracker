import { memo, useCallback, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import type { GoalScenario, Milestone } from '../../../../types'
import type { NewGoalScenario } from '../../../../data/dataSource'
import type { PlanFromToday, ProjectionParams } from '../../../../engine'
import { projectNetWorth, projectNetWorthBand, purchaseYearBreakdown, scenarioToParams } from '../../../../engine'
import { Card } from '../../../components/primitives'
import { LinearChart, type ChartSeries } from '../../../charts/LinearChart'
import { ChartLegend, type LegendItem } from '../../../charts/ChartLegend'
import type { TooltipLine } from '../../../charts/ChartTooltip'
import { sparseLabels } from '../../../charts/linearScale'
import { formatMoneyShort } from '../chartTheme'
import { useAssumedInflation } from '../../../hooks/assumedInflationContext'
import { useMoneyFormat } from '../../../hooks/moneyFormatContext'
import { useGoalsNarrow } from '../useGoalsNarrow'
import { SegmentedControl } from '../../../components/SegmentedControl'
import { HERO_WINDOWS, clipToWindow, heroWindowsFor, insideWindow, type HeroWindowKey } from './heroWindow'
import progressStyles from '../progress.module.css'
import {
  ScenarioSeriesLegend,
  type ScenarioLegendBreakdown,
  type ScenarioLegendItem,
} from './ScenarioSeriesLegend'
import styles from '../goals.module.css'
import { computeChartDisplayData } from './nominalTransform'
import { pointSeriesValueAt } from './checkinChartUtils'

interface ScenarioLine {
  id: string
  /** The saved scenario behind the line; null for the draft. */
  scenarioId: number | null
  name: string
  color: string
  dashed: boolean
  params: ProjectionParams
}

const NO_HIDDEN: ReadonlySet<number> = new Set()

function scenarioLines(
  saved: GoalScenario[],
  draft: NewGoalScenario,
  activeId: number | null,
  dirty: boolean,
  inflationRate: number,
  hiddenIds: ReadonlySet<number> = NO_HIDDEN,
): ScenarioLine[] {
  const lines: ScenarioLine[] = saved
    .filter((s) => (s.id !== activeId || dirty) && !hiddenIds.has(s.id))
    .map((s) => ({
      id: `saved-${s.id}`,
      scenarioId: s.id,
      name: s.name,
      color: s.color,
      dashed: false,
      params: scenarioToParams(s, inflationRate),
    }))
  lines.push({
    id: 'draft',
    scenarioId: null,
    name: `${draft.name} (editing)`,
    color: draft.color,
    dashed: true,
    params: scenarioToParams({ ...draft, id: 0 }, inflationRate),
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
  legendRef,
  staticLegend,
  legendItems,
  activeYear,
  breakdowns,
  yearZeroHint,
  onToggle,
}: {
  isHero: boolean
  legendRef: RefObject<HTMLDivElement | null>
  staticLegend: LegendItem[]
  legendItems: ScenarioLegendItem[]
  activeYear: number | null
  breakdowns: ScenarioLegendBreakdown[]
  yearZeroHint: boolean
  onToggle: ((scenarioId: number) => void) | undefined
}) {
  if (isHero) {
    return (
      <div ref={legendRef}>
        <ScenarioSeriesLegend
          items={legendItems}
          activeYear={activeYear}
          breakdowns={breakdowns}
          yearZeroHint={yearZeroHint}
          onToggle={onToggle}
        />
      </div>
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
  scenarios: GoalScenario[],
  hiddenIds: ReadonlySet<number> = NO_HIDDEN,
) {
  const activeYear = activeIndex != null ? years[activeIndex] ?? null : null
  const legendItems: ScenarioLegendItem[] = useMemo(() => {
    const drawn = series.map((s, idx) => {
      const scenarioId = lines[idx]?.scenarioId ?? null
      return {
        label: names[idx] ?? s.id,
        color: s.color,
        ...(s.dashed ? { dashed: true as const } : {}),
        ...(scenarioId !== null ? { scenarioId } : {}),
        // Gated on the year, not the index: a narrower window can leave a hovered index
        // past the end, and that must read as nothing rather than as zero.
        valueCents: activeYear != null && activeIndex != null ? s.values[activeIndex] ?? 0 : null,
      }
    })
    const drawnById = new Map(drawn.flatMap((d) => (d.scenarioId !== undefined ? [[d.scenarioId, d] as const] : [])))
    // In the scenarios' own order, a hidden one dimmed in its place so it can be brought
    // back from here, rather than dropping to the bottom and moving the rows under it. A
    // loaded, unchanged scenario is drawn as the draft and has no row of its own.
    const rows = scenarios.flatMap((s) => {
      if (hiddenIds.has(s.id)) return [{ label: s.name, color: s.color, scenarioId: s.id, hidden: true, valueCents: null }]
      const item = drawnById.get(s.id)
      return item ? [item] : []
    })
    return [...rows, ...drawn.filter((d) => d.scenarioId === undefined)]
  }, [series, names, lines, activeIndex, activeYear, scenarios, hiddenIds])
  const breakdowns: ScenarioLegendBreakdown[] = useMemo(() => {
    if (activeYear == null) return []
    return lines.flatMap((line) => {
      const breakdown = purchaseYearBreakdown(line.params, activeYear)
      if (!breakdown) return []
      return [
        {
          id: line.scenarioId === null ? 'draft' : String(line.scenarioId),
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

/** Pixels: tall enough on a desktop to read thirty years, short enough on a phone to fit above the fold. */
function heroHeight(narrow: boolean): number {
  return narrow ? 210 : 300
}

/** The hero's window buttons: which years of the projection are drawn. */
function useHeroWindow(isHero: boolean, horizonYears: number) {
  const [picked, setHeroWindow] = useState<HeroWindowKey>('all')
  const heroWindows = useMemo(() => heroWindowsFor(horizonYears), [horizonYears])
  // A window the horizon has since shrunk under falls back to All rather than sitting
  // selected-but-unlisted; picking it again once the horizon grows still works.
  const heroWindow = heroWindows.some((w) => w.value === picked) ? picked : 'all'
  const chosen = HERO_WINDOWS.find((w) => w.value === heroWindow)?.years ?? null
  return { heroWindow, setHeroWindow, heroWindows, windowYears: isHero ? chosen : null }
}

/**
 * The plan from the latest check-in, hero only: the same assumptions projected from the
 * balance actually there, drawn from the check-in's place on the plan's axis as a dotted
 * line in the plan's colour, so ahead or behind can be read on into the future rather than
 * only as a gap today.
 */
function useFromTodaySeries(
  isHero: boolean,
  fromToday: PlanFromToday | null | undefined,
  inflationRate: number,
  windowYears: number | null,
  extentYears: number,
): ChartSeries | null {
  return useMemo(() => {
    if (!isHero || !fromToday) return null
    const limit = windowYears ?? extentYears
    const points = projectNetWorth(scenarioToParams(fromToday.scenario, inflationRate))
      .map((p) => ({ xIndex: fromToday.offsetYears + p.year, value: p.investedCents }))
      .filter((p) => p.xIndex <= limit)
    if (points.length < 2) return null
    return {
      id: 'from-today',
      color: fromToday.scenario.color,
      values: [],
      kind: 'scatter',
      points,
      connect: true,
      dashed: true,
      dots: false,
    }
  }, [isHero, fromToday, inflationRate, windowYears, extentYears])
}

/** The from-today line as drawn, with the legend label it goes under. */
function fromTodayDrawing(
  realPoints: ChartSeries[],
  fromToday: PlanFromToday | null | undefined,
): { line: ChartSeries | null; label: string } {
  const line = realPoints[0] ?? null
  return { line, label: fromToday ? `${fromToday.scenario.name}, from today` : '' }
}

/** The draft's uncertainty band, hero only. */
function useBandSeries(isHero: boolean, draft: NewGoalScenario, inflationRate: number): ChartSeries | null {
  return useMemo(() => {
    if (!isHero) return null
    const { lo, hi } = projectNetWorthBand(scenarioToParams(draft, inflationRate))
    return { id: 'uncertainty-band', color: draft.color, values: [], kind: 'band', band: { lo, hi } }
  }, [isHero, draft, inflationRate])
}

/** Everything drawn, cut at the window in one go so the axis fits what is left. */
function useWindowedSeries(
  full: { years: number[]; series: ChartSeries[] },
  band: ChartSeries | null,
  extra: ChartSeries[],
  windowYears: number | null,
) {
  return useMemo(() => {
    const bandList = band ? [band] : []
    const cut = clipToWindow(full.years, [...full.series, ...bandList, ...extra], windowYears)
    const n = full.series.length
    return {
      years: cut.years,
      series: cut.series.slice(0, n),
      band: band ? cut.series[n] ?? null : null,
      extra: cut.series.slice(n + bandList.length),
    }
  }, [full, band, extra, windowYears])
}

function useLifeEventMarkers(isHero: boolean, draft: NewGoalScenario, windowYears: number | null) {
  return useMemo(() => {
    if (!isHero) return []
    return (draft.lifeEvents ?? [])
      .filter((ev) => ev.year >= 1 && ev.year <= draft.horizonYears && insideWindow(ev.year, windowYears))
      .map((ev) => ({ yearIndex: ev.year, label: ev.label, amountCents: ev.amountCents }))
  }, [isHero, draft.lifeEvents, draft.horizonYears, windowYears])
}

/** The FI number for the draft, hero only, and only when spend and rate make sense. */
function useFiTarget(isHero: boolean, draft: NewGoalScenario): number | null {
  return useMemo(() => {
    if (!isHero || draft.annualSpendCents <= 0 || draft.safeWithdrawalRate <= 0) return null
    return Math.round(draft.annualSpendCents / draft.safeWithdrawalRate)
  }, [isHero, draft.annualSpendCents, draft.safeWithdrawalRate])
}

/**
 * Milestones the plan gets within reach of, plus the FI target when it is not one of
 * them. Inside a window the FI target answers to the same ceiling, or a 5Y view could
 * never zoom in; in the All view it is always drawn, since the whole horizon is the one
 * place to see how far off it is.
 */
function useRefLines(
  milestones: Milestone[],
  yDomainMax: number | undefined,
  fiTargetCents: number | null,
  windowed: boolean,
  nominalMode: boolean,
) {
  return useMemo(() => {
    // The targets are in today's money and a reference line is flat, while the nominal view
    // inflates the plan past them: drawn there, the plan would seem to cross them early.
    if (nominalMode) return []
    // A milestone far above the plan's own ceiling would squash the projection
    // flat against the axis, so only draw the ones it gets within reach of.
    const ceiling = yDomainMax != null && yDomainMax > 0 ? yDomainMax * 1.15 : Infinity
    const base = milestones.map((m) => m.amountCents).filter((m) => m <= ceiling)
    const fiFits = fiTargetCents !== null && (!windowed || fiTargetCents <= ceiling)
    return fiFits && !base.includes(fiTargetCents)
      ? [...base, fiTargetCents].sort((a, b) => a - b)
      : base
  }, [milestones, yDomainMax, fiTargetCents, windowed, nominalMode])
}

function HeroWindowPicker({
  windows,
  value,
  onChange,
}: {
  windows: ReturnType<typeof heroWindowsFor>
  value: HeroWindowKey
  onChange: (next: HeroWindowKey) => void
}) {
  if (windows.length < 2) return null
  return (
    <SegmentedControl
      options={windows.map((w) => ({ value: w.value, label: w.label }))}
      value={value}
      onChange={onChange}
      ariaLabel="Projection window"
      layout="compact"
    />
  )
}

/** The today marker, only while it lies inside the window. */
function todayProp(todayIndex: number | undefined, windowYears: number | null): { todayIndex?: number } {
  return insideWindow(todayIndex, windowYears) && todayIndex !== undefined ? { todayIndex } : {}
}

function variantProps(
  isHero: boolean,
  narrow: boolean,
  markerYears: { yearIndex: number }[],
  lifeEventMarkers: { yearIndex: number; label: string; amountCents: number }[],
  onActiveIndexChange: (index: number | null) => void,
) {
  return isHero
    ? {
        height: heroHeight(narrow),
        markerYears,
        lifeEventMarkers,
        // On a wide screen the legend under the chart reads the year. Where the page is one column
        // the legend can be below the fold, so the chart gets a tooltip too, which stays away
        // while the legend is fully on screen and would only cover what it repeats.
        tooltipMode: narrow ? ('full' as const) : ('hidden' as const),
        onActiveIndexChange,
      }
    : { height: 210, markerYears: [], tooltipMode: 'full' as const }
}

const HERO_HINT =
  'At a purchase year, return and contributions apply before the down payment is withdrawn — select a year on the chart for values and the purchase breakdown. Dashed vertical marks show purchase years.'
const DEFAULT_HINT =
  'Compare saved scenarios plus your live edits. At a purchase year, return and contributions apply before the down payment is withdrawn — hover that year for the breakdown.'

function NetWorthChartImpl({
  scenarios,
  draft,
  activeId = null,
  dirty = false,
  variant = 'default',
  footer,
  extraSeries = [],
  todayIndex,
  nominalMode = false,
  viewInflation,
  milestones,
  hiddenIds,
  onToggleVisible,
  fromToday,
}: {
  scenarios: GoalScenario[]
  draft: NewGoalScenario
  activeId?: number | null
  dirty?: boolean
  variant?: 'default' | 'hero'
  footer?: ReactNode
  extraSeries?: ChartSeries[]
  todayIndex?: number
  nominalMode?: boolean
  /** The plan restarted from the latest check-in, drawn dotted from the check-in on. */
  fromToday?: PlanFromToday | null | undefined
  /**
   * The rate the Nominal view inflates the plan by while it is being previewed. It changes
   * only that drawing: the projection, the check-in dots, the Y-axis floor and everything
   * beside the chart stay at the saved assumed inflation, and it has no effect outside the
   * Nominal view.
   */
  viewInflation?: number | null | undefined
  milestones: Milestone[]
  /** Saved scenarios left off the chart; the legend lists them dimmed and can bring them back. */
  hiddenIds?: ReadonlySet<number> | undefined
  onToggleVisible?: ((scenarioId: number) => void) | undefined
}) {
  const format = useMoneyFormat()
  const assumedInflation = useAssumedInflation()
  const narrow = useGoalsNarrow()
  const legendRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const onActiveIndexChange = useCallback((index: number | null) => {
    setActiveIndex(index)
  }, [])
  const isHero = variant === 'hero'
  const lines = useMemo(
    () => scenarioLines(scenarios, draft, activeId, dirty, assumedInflation, hiddenIds),
    [scenarios, draft, activeId, dirty, assumedInflation, hiddenIds],
  )
  const full = useMemo(() => buildSeries(lines), [lines])
  // The windows on offer follow how far the chart actually runs, which is the longest
  // drawn horizon, not only the draft's.
  const extentYears = full.years[full.years.length - 1] ?? draft.horizonYears
  const { heroWindow, setHeroWindow, heroWindows, windowYears } = useHeroWindow(isHero, extentYears)
  const names = full.names
  const bandSeries = useBandSeries(isHero, draft, assumedInflation)
  const fromTodaySeries = useFromTodaySeries(isHero, fromToday, assumedInflation, windowYears, extentYears)
  const { years, series, band, extra } = useWindowedSeries(full, bandSeries, extraSeries, windowYears)
  const markerYears = useMemo(() => purchaseMarkerIndices(lines, years), [lines, years])
  const labels = useMemo(() => sparseLabels(years, 5), [years])

  // Locks the Y-axis to the larger of the real/nominal maxima so toggling display
  // mode moves the lines on a fixed scale instead of rescaling the whole chart.
  const { displaySeries, displayExtraSeries, displayRealPoints, displayBand, yDomainMax } = useMemo(
    () =>
      computeChartDisplayData(
        series,
        extra,
        years,
        nominalMode,
        assumedInflation,
        band,
        viewInflation,
        fromTodaySeries ? [fromTodaySeries] : [],
      ),
    [series, extra, years, nominalMode, assumedInflation, band, viewInflation, fromTodaySeries],
  )
  const { line: fromTodayLine, label: fromTodayLabel } = fromTodayDrawing(displayRealPoints, fromToday)

  const refLines = useRefLines(milestones, yDomainMax, useFiTarget(isHero, draft), windowYears !== null, nominalMode)
  const staticLegend: LegendItem[] = useMemo(
    () => series.map((s, idx) => ({ label: names[idx] ?? s.id, color: s.color })),
    [series, names],
  )
  const { activeYear, legendItems, breakdowns, yearZeroHint } = useChartLegendState(
    lines,
    displaySeries,
    names,
    years,
    activeIndex,
    scenarios,
    hiddenIds,
  )

  const tooltip = useCallback(
    (i: number): { title: string; lines: TooltipLine[] } => {
      const year = years[i] ?? i
      const tooltipLines: TooltipLine[] = displaySeries.map((s, idx) => ({
        label: names[idx] ?? s.id,
        value: formatMoneyShort(s.values[i] ?? 0, format),
        color: s.color,
        tone: 'neutral',
      }))
      const fromTodayValue = fromTodayLine ? pointSeriesValueAt(fromTodayLine.points ?? [], year) : null
      if (fromTodayValue !== null) {
        tooltipLines.push({ label: fromTodayLabel, value: formatMoneyShort(fromTodayValue, format), color: fromTodayLine?.color, tone: 'neutral' })
      }
      return { title: `Year ${year}`, lines: tooltipLines }
    },
    [years, displaySeries, names, format, fromTodayLine, fromTodayLabel],
  )
  // Listed last, after the draft: it belongs to the plan but is not a scenario of its own.
  const legendWithFromToday: ScenarioLegendItem[] = useMemo(() => {
    if (!fromTodayLine) return legendItems
    const valueCents = activeYear != null ? pointSeriesValueAt(fromTodayLine.points ?? [], activeYear) : null
    return [...legendItems, { label: fromTodayLabel, color: fromTodayLine.color, dotted: true, valueCents }]
  }, [legendItems, fromTodayLine, fromTodayLabel, activeYear])

  const lifeEventMarkers = useLifeEventMarkers(isHero, draft, windowYears)
  const heroVariantProps = variantProps(isHero, narrow, markerYears, lifeEventMarkers, onActiveIndexChange)

  return (
    <Card className={isHero ? `${styles.chartCard} ${styles.heroChart}` : styles.chartCard}>
      <div className={progressStyles.chartHeaderRow}>
        <h3 className={styles.chartTitle}>Invested portfolio projection</h3>
        {isHero ? <HeroWindowPicker windows={heroWindows} value={heroWindow} onChange={setHeroWindow} /> : null}
      </div>
      <p className={styles.chartHint}>{isHero ? HERO_HINT : DEFAULT_HINT}</p>
      <LinearChart
        {...heroVariantProps}
        readoutRef={legendRef}
        series={[...(displayBand ? [displayBand] : []), ...displaySeries, ...displayRealPoints, ...displayExtraSeries]}
        xLabels={labels}
        refLines={refLines}
        {...todayProp(todayIndex, windowYears)}
        yDomainMax={yDomainMax}
        formatValue={(c) => formatMoneyShort(c, format)}
        ariaLabel="Invested portfolio projection by year"
        tooltip={tooltip}
      />
      <PortfolioLegend
        isHero={isHero}
        staticLegend={staticLegend}
        legendItems={legendWithFromToday}
        activeYear={activeYear}
        breakdowns={breakdowns}
        yearZeroHint={yearZeroHint}
        onToggle={onToggleVisible}
        legendRef={legendRef}
      />
      {footer != null ? <div className={styles.chartFooter}>{footer}</div> : null}
    </Card>
  )
}

export const NetWorthChart = memo(NetWorthChartImpl)
