import { memo, useCallback, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import type { GoalScenario, Milestone } from '../../../../types'
import type { NewGoalScenario } from '../../../../data/dataSource'
import type { MoneyFormat, PlanFromToday } from '../../../../engine'
import {
  RETURN_BAND_SPREAD,
  formatPercent,
  lineValues,
  projectNetWorth,
  projectNetWorthBand,
  scenarioToParams,
} from '../../../../engine'
import { Card } from '../../../components/primitives'
import { LinearChart, type ChartSeries } from '../../../charts/LinearChart'
import type { ValueTagSpec } from '../../../charts/valueTags'
import { ChartLegend, type LegendItem } from '../../../charts/ChartLegend'
import type { TooltipLine } from '../../../charts/ChartTooltip'
import { useInBand } from '../../../charts/useInBand'
import { sparseLabels } from '../../../charts/linearScale'
import { formatMoneyShort } from '../chartTheme'
import { useAssumedInflation } from '../../../hooks/assumedInflationContext'
import { useMoneyFormat } from '../../../hooks/moneyFormatContext'
import { useGoalsNarrow } from '../useGoalsNarrow'
import { HeroWindowPicker } from './HeroWindowPicker'
import { HeroTitleRow } from './heroSheet/HeroTitleRow'
import { useActiveIndex } from './heroSheet/useActiveIndex'
import { useHeroSheet } from './heroSheet/useHeroSheet'
import { fromTodayPoints } from './fromTodayLine'
import { referenceLines, type ReferenceLines } from './referenceLines'
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
import { inkOn, scenarioInk } from '../scenarioInk'
import { chartMoneyLabel } from '../planMoneyLabel'
import { ChartKeys, type ChartKeyMarks } from './ChartKeys'
import { BreakdownSlot } from './ScenarioSeriesLegend'
import { NO_HIDDEN, useChartLegendState, withFromToday, type ScenarioLine } from './heroLegendState'
import { usePublishHeroLegend, type HeroLegendStore } from './heroLegendStore'

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
      color: scenarioInk(s.color),
      dashed: false,
      params: scenarioToParams(s, inflationRate),
    }))
  lines.push({
    id: 'draft',
    scenarioId: null,
    name: `${draft.name} (editing)`,
    color: scenarioInk(draft.color),
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
    // A line runs from year 0 to its own horizon and stops there. Filling the years after it with
    // zero drew the portfolio falling to nothing at the end of a shorter scenario, which is what
    // setting a longer horizon on the one being edited did to the saved ones.
    return {
      id: line.id,
      color: line.color,
      ...lineValues(points),
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

/** The breakdown floats on the half of the chart the pointer is not in. */
function floatSideFor(activeIndex: number | null, pointCount: number): 'start' | 'end' {
  return activeIndex != null && activeIndex > (pointCount - 1) / 2 ? 'start' : 'end'
}

const NO_BREAKDOWNS: ScenarioLegendBreakdown[] = []

/** What the line under the chart says where the scenarios' chips are above it, not under it. */
const CHIPS_ABOVE_HINT = 'The values in the chips above are for the last year, or for the year you point at.'

function PortfolioLegend({
  isHero,
  narrow,
  listRef,
  staticLegend,
  legendItems,
  chipsAbove,
  activeYear,
  breakdowns,
  yearZeroHint,
  breakdownInTodaysMoney,
  floatSide,
  onToggle,
}: {
  isHero: boolean
  narrow: boolean
  /** The scenarios are listed in chips above the chart, so only what has no chip is listed here. */
  chipsAbove: boolean
  listRef: RefObject<HTMLUListElement | null>
  staticLegend: LegendItem[]
  legendItems: ScenarioLegendItem[]
  activeYear: number | null
  breakdowns: ScenarioLegendBreakdown[]
  yearZeroHint: boolean
  /** The purchase breakdown is worked out in today's money, whichever way the lines are drawn. */
  breakdownInTodaysMoney: boolean
  /** Which side of the chart the wide layout's floating breakdown sits on. */
  floatSide: 'start' | 'end'
  onToggle: ((scenarioId: number) => void) | undefined
}) {
  if (isHero) {
    return (
      <ScenarioSeriesLegend
        items={chipsAbove ? legendItems.filter((item) => item.dotted) : legendItems}
        {...(chipsAbove ? { chipsAbove: true, hint: CHIPS_ABOVE_HINT } : {})}
        activeYear={activeYear}
        breakdowns={chipsAbove ? NO_BREAKDOWNS : breakdowns}
        yearZeroHint={chipsAbove ? false : yearZeroHint}
        breakdownInTodaysMoney={breakdownInTodaysMoney}
        onToggle={onToggle}
        listRef={listRef}
        layout={narrow ? 'rows' : 'chips'}
        floatSide={floatSide}
      />
    )
  }
  return <ChartLegend items={staticLegend} variant="stack" />
}

/** Pixels: tall enough on a desktop to read thirty years, short enough on a phone to fit above the fold. */
function heroHeight(narrow: boolean): number {
  // A wide screen gives the chart the page's width, and a plot that wide needs the height to
  // stay a chart and not a ribbon. The open scenario's chip is as tall as its tags make it, and the
  // levers bar held at the bottom of a 1280x800 screen still has to clear the legend under the chart.
  return narrow ? 210 : 316
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
    const all = fromTodayPoints(fromToday, inflationRate)
    const points = all.filter((p) => p.xIndex <= limit)
    // The steps sit a fraction of a year past the axis' own (the check-in is not on a year), so
    // the last one inside the window stops short of it, and the line has no value at the final
    // year. Carry it there along the step it is cut from.
    const last = points[points.length - 1]
    const next = all[points.length]
    if (last && next && last.xIndex < limit) {
      const t = (limit - last.xIndex) / (next.xIndex - last.xIndex)
      points.push({ xIndex: limit, value: Math.round(last.value + t * (next.value - last.value)) })
    }
    if (points.length < 2) return null
    return {
      id: 'from-today',
      color: scenarioInk(fromToday.scenario.color),
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

/** The draft at a return three points either side, hero only: a sensitivity to the return, not a range of likely outcomes. */
function useBandSeries(isHero: boolean, draft: NewGoalScenario, inflationRate: number): ChartSeries | null {
  return useMemo(() => {
    if (!isHero) return null
    return {
      id: 'uncertainty-band',
      color: scenarioInk(draft.color),
      values: [],
      kind: 'band',
      band: projectNetWorthBand(scenarioToParams(draft, inflationRate)),
    }
  }, [isHero, draft, inflationRate])
}

/**
 * The inflation the plan is projected at. The monthly amount is euros as sent, so the real line
 * itself depends on the inflation it is brought back by: a previewed rate is a new projection,
 * not the saved one drawn higher.
 */
function projectionAtPreview(
  nominalMode: boolean,
  viewInflation: number | null | undefined,
  savedInflation: number,
): { previewing: boolean; projectionRate: number } {
  const previewing = nominalMode && viewInflation != null && viewInflation !== savedInflation
  return { previewing, projectionRate: previewing ? viewInflation : savedInflation }
}

/**
 * The lines at the saved inflation while another rate is being previewed, cut at the window like
 * the lines drawn: the Nominal view holds its axis at the height the saved rate gives it, whatever
 * is previewed, so stepping the preview moves the plan against a scale that holds still.
 */
function useSavedRateFloor(
  previewing: boolean,
  scenarios: GoalScenario[],
  draft: NewGoalScenario,
  activeId: number | null,
  dirty: boolean,
  savedInflation: number,
  hiddenIds: ReadonlySet<number> | undefined,
  windowYears: number | null,
): ChartSeries[] | null {
  return useMemo(() => {
    if (!previewing) return null
    const built = buildSeries(scenarioLines(scenarios, draft, activeId, dirty, savedInflation, hiddenIds))
    return clipToWindow(built.years, built.series, windowYears).series
  }, [previewing, scenarios, draft, activeId, dirty, savedInflation, hiddenIds, windowYears])
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
 * Milestones and the FI target as reference lines, in both views (see `referenceLines`): a milestone
 * is an amount on the account and the FI target is in the plan's money, so each is flat in one view
 * and moves with the inflation in the other. A target far above the plan is left off, and reported,
 * rather than drawn: a reference line sets the axis, so a 25M target over a plan that reaches 8M would
 * leave the lines in the bottom third of the chart. That holds in every window, All included.
 */
function useRefLines(
  milestones: Milestone[],
  drawnMax: number | undefined,
  fiTargetCents: number | null,
  nominalMode: boolean,
  years: number[],
  inflationRate: number,
): ReferenceLines {
  return useMemo(
    () => referenceLines({ milestones, drawnMax, fiTargetCents, nominalMode, years, inflationRate }),
    [milestones, drawnMax, fiTargetCents, nominalMode, years, inflationRate],
  )
}

/** The FI target as a marker on the chart's top edge when it is above the chart, so leaving it off the axis is not a silent omission. */
const PROJECTION_LABEL = 'Invested portfolio projection by year'

/** The chart's accessible name, which carries the FI target when it is only marked: the marker's own title is not read out of an image. */
function projectionLabel(marker: { title: string } | undefined): string {
  return marker ? `${PROJECTION_LABEL}. ${marker.title}` : PROJECTION_LABEL
}

function fiMarker(cents: number | null, format: MoneyFormat): { label: string; title: string } | undefined {
  if (cents === null) return undefined
  const amount = formatMoneyShort(cents, format)
  return { label: `FI ${amount}`, title: `The FI target, ${amount}, is above the top of this chart.` }
}

/**
 * The hero's header: the title, and on the right the window buttons, with, where a wide screen
 * has the room, the display switch beside them. A phone has the button that opens the chart full
 * screen at the end of the title's line.
 */
function ChartHeader({
  isHero,
  money,
  aside,
  windows,
  value,
  onChange,
  onOpenSheet,
}: {
  isHero: boolean
  /** What the chart's euros are, said beside the title where the title has the room. */
  money: string
  aside: ReactNode
  windows: ReturnType<typeof heroWindowsFor>
  value: HeroWindowKey
  onChange: (next: HeroWindowKey) => void
  onOpenSheet: (() => void) | undefined
}) {
  const picker = isHero ? <HeroWindowPicker windows={windows} value={value} onChange={onChange} /> : null
  return (
    <div className={progressStyles.chartHeaderRow}>
      {onOpenSheet ? (
        <HeroTitleRow onOpen={onOpenSheet} />
      ) : (
        <div className={styles.chartTitleBlock}>
          <h3 className={styles.chartTitle}>Invested portfolio projection</h3>
          <span className={styles.chartMoney}>{money}</span>
        </div>
      )}
      {isHero && aside ? (
        <div className={styles.chartTools}>
          {aside}
          {picker}
        </div>
      ) : (
        picker
      )}
    </div>
  )
}

/** What is under the legend: a box of its own on a phone, a line of the card on a wide screen. */
function ChartFooter({ footer, bare }: { footer: ReactNode; bare: boolean }) {
  if (footer == null) return null
  return <div className={bare ? styles.chartFooterBare : styles.chartFooter}>{footer}</div>
}

/**
 * The line above the chart. On a wide screen the hero has none: what it said is a note under the
 * legend instead (HeroNote), so the chart starts two lines higher and the page does not move
 * when a year is hovered.
 */
function chartHint(isHero: boolean, narrow: boolean, money: string): string | null {
  const said = (hint: string) => `${money.charAt(0).toUpperCase()}${money.slice(1)}. ${hint}`
  if (!isHero) return said(DEFAULT_HINT)
  return narrow ? said(HERO_HINT) : null
}

/** The today marker, only while it lies inside the window. */
function todayProp(todayIndex: number | undefined, windowYears: number | null): { todayIndex?: number } {
  return insideWindow(todayIndex, windowYears) && todayIndex !== undefined ? { todayIndex } : {}
}

function variantProps(
  isHero: boolean,
  narrow: boolean,
  legendInBand: boolean,
  markerYears: { yearIndex: number }[],
  lifeEventMarkers: { yearIndex: number; label: string; amountCents: number }[],
  onActiveIndexChange: (index: number | null) => void,
) {
  // The tooltip is only an extra, temporary readout for while the legend has scrolled out of
  // view; the legend below always shows its own values regardless.
  const showPopup = narrow && !legendInBand
  return isHero
    ? {
        height: heroHeight(narrow),
        markerYears,
        lifeEventMarkers,
        tooltipMode: showPopup ? ('full' as const) : ('hidden' as const),
        // The legend below has its own always-there readout; the tooltip never has to fall
        // back to a second one below the chart, only above it or not at all.
        dockBelow: false,
        onActiveIndexChange,
      }
    : { height: 210, markerYears: [], tooltipMode: 'full' as const }
}

const HERO_HINT =
  'At a purchase year, return and contributions apply before the down payment is withdrawn — select a year on the chart for values and the purchase breakdown. Dashed vertical marks show purchase years. The shaded band is the edited plan at a return three points lower and higher: how much the return matters, not how likely an outcome is.'
const DEFAULT_HINT =
  'Compare saved scenarios plus your live edits. At a purchase year, return and contributions apply before the down payment is withdrawn — hover that year for the breakdown.'

/**
 * What the wide hero's marks mean, under its legend: the purchase years, why a purchase dips the
 * line, and what the band is, which nothing else on the chart says. Static, so it never changes
 * height as a year is hovered the way the line above the chips does.
 */
/** Which marks the hero chart draws beyond its lines, for the key under the legend. */
function chartKeyMarks(
  isHero: boolean,
  checkinSeries: number,
  lifeEvents: { amountCents: number }[],
): ChartKeyMarks {
  return {
    checkins: isHero && checkinSeries > 0,
    lifeIn: lifeEvents.some((ev) => ev.amountCents >= 0),
    lifeOut: lifeEvents.some((ev) => ev.amountCents < 0),
  }
}

function HeroNote({ draft, isHero, narrow }: { draft: NewGoalScenario; isHero: boolean; narrow: boolean }) {
  const format = useMoneyFormat()
  // A phone has the explanation above the chart instead (chartHint).
  if (!isHero || narrow) return null
  const low = Math.max(0, draft.expectedRealReturn - RETURN_BAND_SPREAD)
  const high = draft.expectedRealReturn + RETURN_BAND_SPREAD
  return (
    <p className={`${styles.chartHint} ${styles.heroNote}`}>
      Dashed vertical lines mark purchase years: in one, return and contributions apply before the down payment
      comes out. The shaded band is the line you are editing at a real return of {formatPercent(low, format)} to{' '}
      {formatPercent(high, format)}, three points either side. It shows how much the return matters, not how
      likely an outcome is.
    </p>
  )
}

interface HeroFootnoteProps {
  draft: NewGoalScenario
  isHero: boolean
  narrow: boolean
  chipsAbove: boolean
  breakdowns: ScenarioLegendBreakdown[]
  yearZeroHint: boolean
  breakdownInTodaysMoney: boolean
  reserve: boolean
}

/**
 * Under the wide hero: the note on what the marks mean. With the scenarios' chips above the chart
 * the purchase breakdown has no legend to float over, so it takes the note's place, in a slot as
 * tall as it, while a purchase year is pointed at.
 */
function HeroFootnote({ chipsAbove, breakdowns, yearZeroHint, breakdownInTodaysMoney, reserve, ...note }: HeroFootnoteProps) {
  if (!chipsAbove || !note.isHero || note.narrow) return <HeroNote {...note} />
  return (
    <BreakdownSlot breakdowns={breakdowns} yearZeroHint={yearZeroHint} breakdownInTodaysMoney={breakdownInTodaysMoney} reserve={reserve}>
      <HeroNote {...note} />
    </BreakdownSlot>
  )
}

/**
 * The wide hero tags each line's value in a chip beside its dot (and the band's over and under
 * values), to two decimals in millions: the chips above the chart are what names the lines, so the
 * chart itself only has to say how much. Absent where the chips are not above it.
 */
function useValueTags(on: boolean, expectedRealReturn: number, format: MoneyFormat): ValueTagSpec | undefined {
  return useMemo(
    () =>
      on
        ? {
            format: (cents: number) => formatMoneyShort(cents, format, 2),
            textOn: inkOn,
            bandLabels: {
              lo: formatPercent(Math.max(0, expectedRealReturn - RETURN_BAND_SPREAD), format),
              hi: formatPercent(expectedRealReturn + RETURN_BAND_SPREAD, format),
            },
          }
        : undefined,
    [on, expectedRealReturn, format],
  )
}

function NetWorthChartImpl({
  scenarios,
  draft,
  activeId = null,
  dirty = false,
  variant = 'default',
  footer,
  footerBare = false,
  headerAside,
  displaySwitch,
  extraSeries = [],
  todayIndex,
  nominalMode = false,
  viewInflation,
  milestones,
  hiddenIds,
  onToggleVisible,
  fromToday,
  legendStore,
}: {
  scenarios: GoalScenario[]
  draft: NewGoalScenario
  activeId?: number | null
  dirty?: boolean
  variant?: 'default' | 'hero'
  footer?: ReactNode
  /** The footer is a line of the card, not a box of its own. */
  footerBare?: boolean
  /** Beside the window buttons in the hero's header, where a wide screen has the room for it. */
  headerAside?: ReactNode
  /** Nominal or Purchasing power, for the full-screen chart's bar: unlike `headerAside` it is there on a phone too. */
  displaySwitch?: ReactNode
  extraSeries?: ChartSeries[]
  todayIndex?: number
  nominalMode?: boolean
  /** The plan restarted from the latest check-in, drawn dotted from the check-in on. */
  fromToday?: PlanFromToday | null | undefined
  /**
   * The rate the Nominal view projects and inflates the plan at while it is being previewed.
   * It changes only that drawing: the check-in dots, the Y-axis floor and everything beside
   * the chart stay at the saved assumed inflation, and it has no effect outside the Nominal
   * view.
   */
  viewInflation?: number | null | undefined
  milestones: Milestone[]
  /** Saved scenarios left off the chart; the legend lists them dimmed and can bring them back. */
  hiddenIds?: ReadonlySet<number> | undefined
  onToggleVisible?: ((scenarioId: number) => void) | undefined
  /**
   * Where the scenarios' chips, above the chart, read the lines from. With it the legend under the
   * chart lists only what has no chip (the plan from today).
   */
  legendStore?: HeroLegendStore | undefined
}) {
  const format = useMoneyFormat()
  const assumedInflation = useAssumedInflation()
  const narrow = useGoalsNarrow()
  const listRef = useRef<HTMLUListElement>(null)
  const { activeIndex, onActiveIndexChange, lastIndex } = useActiveIndex()
  const legendInBand = useInBand(listRef, 1, { enabled: narrow })
  const isHero = variant === 'hero'
  const { previewing, projectionRate } = projectionAtPreview(nominalMode, viewInflation, assumedInflation)
  const lines = useMemo(
    () => scenarioLines(scenarios, draft, activeId, dirty, projectionRate, hiddenIds),
    [scenarios, draft, activeId, dirty, projectionRate, hiddenIds],
  )
  const full = useMemo(() => buildSeries(lines), [lines])
  // The windows on offer follow how far the chart actually runs, which is the longest
  // drawn horizon, not only the draft's.
  const extentYears = full.years[full.years.length - 1] ?? draft.horizonYears
  const { heroWindow, setHeroWindow, heroWindows, windowYears } = useHeroWindow(isHero, extentYears)
  const names = full.names
  const bandSeries = useBandSeries(isHero, draft, projectionRate)
  const fromTodaySeries = useFromTodaySeries(isHero, fromToday, projectionRate, windowYears, extentYears)
  const { years, series, band, extra } = useWindowedSeries(full, bandSeries, extraSeries, windowYears)
  const markerYears = useMemo(() => purchaseMarkerIndices(lines, years), [lines, years])
  const labels = useMemo(() => sparseLabels(years, 5), [years])

  // Each view fits its own axis, so Purchasing power is not stretched to the nominal plan's
  // height; toggling rescales, and only Nominal holds a floor (for the rate preview).
  const floorSeries = useSavedRateFloor(previewing, scenarios, draft, activeId, dirty, assumedInflation, hiddenIds, windowYears)
  const { displaySeries, displayExtraSeries, displayRealPoints, displayBand, yDomainMax, drawnMax } = useMemo(
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
        floorSeries,
      ),
    [series, extra, years, nominalMode, assumedInflation, band, viewInflation, fromTodaySeries, floorSeries],
  )
  const { line: fromTodayLine, label: fromTodayLabel } = fromTodayDrawing(displayRealPoints, fromToday)

  const { lines: refLines, curves: refCurves, fiAbove } = useRefLines(
    milestones,
    drawnMax,
    useFiTarget(isHero, draft),
    nominalMode,
    years,
    projectionRate,
  )
  const fiChartMarker = useMemo(() => fiMarker(fiAbove, format), [fiAbove, format])
  // Stable between renders, so a year pointed at, which re-renders this, does not make the chart
  // work out its axis and paths again from arrays that only look new.
  const chartSeries = useMemo(
    () => [...(displayBand ? [displayBand] : []), ...displaySeries, ...displayRealPoints, ...displayExtraSeries],
    [displayBand, displaySeries, displayRealPoints, displayExtraSeries],
  )
  const formatValue = useCallback((cents: number) => formatMoneyShort(cents, format), [format])
  const valueTags = useValueTags(legendStore !== undefined && isHero && !narrow, draft.expectedRealReturn, format)
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

  usePublishHeroLegend(legendStore, lines, displaySeries, names, years, activeIndex, scenarios, hiddenIds)

  const tooltip = useCallback(
    (i: number): { title: string; lines: TooltipLine[] } => {
      const year = years[i] ?? i
      // A scenario whose horizon is behind this year has no value in it, so it has no line here.
      const tooltipLines: TooltipLine[] = displaySeries.flatMap((s, idx) => {
        const value = s.values[i]
        if (value === undefined) return []
        return [{ label: names[idx] ?? s.id, value: formatMoneyShort(value, format), color: s.color, tone: 'neutral' as const }]
      })
      const fromTodayValue = fromTodayLine ? pointSeriesValueAt(fromTodayLine.points ?? [], year) : null
      if (fromTodayValue !== null) {
        tooltipLines.push({ label: fromTodayLabel, value: formatMoneyShort(fromTodayValue, format), color: fromTodayLine?.color, tone: 'neutral' })
      }
      return { title: `Year ${year}`, lines: tooltipLines }
    },
    [years, displaySeries, names, format, fromTodayLine, fromTodayLabel],
  )
  const legendWithFromToday = useMemo(
    () => withFromToday(legendItems, fromTodayLine, fromTodayLabel, activeYear),
    [legendItems, fromTodayLine, fromTodayLabel, activeYear],
  )

  const lifeEventMarkers = useLifeEventMarkers(isHero, draft, windowYears)
  const heroVariantProps = variantProps(isHero, narrow, legendInBand, markerYears, lifeEventMarkers, onActiveIndexChange)

  // What the full-screen chart draws from, held between renders so a year pointed at in the card,
  // which re-renders this, does not hand it new objects to work from.
  const sheetChart = useMemo(
    () => ({
      series: chartSeries,
      xLabels: labels,
      refLines,
      refCurves,
      markerYears,
      lifeEventMarkers,
      ...todayProp(todayIndex, windowYears),
      yDomainMax,
      aboveTop: fiChartMarker,
      ariaLabel: projectionLabel(fiChartMarker),
      formatValue,
      tooltip,
    }),
    [chartSeries, labels, refLines, refCurves, markerYears, lifeEventMarkers, todayIndex, windowYears, yDomainMax, fiChartMarker, formatValue, tooltip],
  )
  const sheetLegend = useMemo(
    () => ({
      lines,
      displaySeries,
      names,
      years,
      scenarios,
      hiddenIds,
      fromTodayLine,
      fromTodayLabel,
      nominalMode,
      onToggleVisible,
    }),
    [lines, displaySeries, names, years, scenarios, hiddenIds, fromTodayLine, fromTodayLabel, nominalMode, onToggleVisible],
  )
  const { onOpen: onOpenSheet, sheet } = useHeroSheet(
    {
      chart: sheetChart,
      legend: sheetLegend,
      displaySwitch,
      windows: heroWindows,
      windowValue: heroWindow,
      onWindowChange: setHeroWindow,
    },
    isHero,
    lastIndex,
  )

  const money = chartMoneyLabel(draft.planStartDate, nominalMode)
  const hint = chartHint(isHero, narrow, money)

  return (
    <Card className={isHero ? `${styles.chartCard} ${styles.heroChart}` : styles.chartCard}>
      <ChartHeader
        isHero={isHero}
        money={money}
        aside={headerAside}
        windows={heroWindows}
        value={heroWindow}
        onChange={setHeroWindow}
        onOpenSheet={onOpenSheet}
      />
      {hint ? <p className={styles.chartHint}>{hint}</p> : null}
      <LinearChart
        {...heroVariantProps}
        aboveTop={fiChartMarker}
        series={chartSeries}
        xLabels={labels}
        refLines={refLines}
        refCurves={refCurves}
        {...todayProp(todayIndex, windowYears)}
        yDomainMax={yDomainMax}
        formatValue={formatValue}
        valueTags={valueTags}
        ariaLabel={projectionLabel(fiChartMarker)}
        tooltip={tooltip}
      />
      <PortfolioLegend
        isHero={isHero}
        narrow={narrow}
        staticLegend={staticLegend}
        legendItems={legendWithFromToday}
        chipsAbove={legendStore !== undefined}
        activeYear={activeYear}
        breakdowns={breakdowns}
        yearZeroHint={yearZeroHint}
        breakdownInTodaysMoney={nominalMode}
        floatSide={floatSideFor(activeIndex, years.length)}
        onToggle={onToggleVisible}
        listRef={listRef}
      />
      <ChartKeys {...chartKeyMarks(isHero, displayExtraSeries.length, lifeEventMarkers)} />
      <HeroFootnote
        draft={draft}
        isHero={isHero}
        narrow={narrow}
        chipsAbove={legendStore !== undefined}
        breakdowns={breakdowns}
        yearZeroHint={yearZeroHint}
        breakdownInTodaysMoney={nominalMode}
        reserve={markerYears.length > 0}
      />
      <ChartFooter footer={footer} bare={footerBare} />
      {sheet}
    </Card>
  )
}

export const NetWorthChart = memo(NetWorthChartImpl)
