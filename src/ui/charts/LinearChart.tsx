import { useEffect, useId, useRef, type RefObject } from 'react'
import { claimActiveTooltip, releaseActiveTooltip } from './activeTooltipRegistry'
import { ChartTooltip, type TooltipLine } from './ChartTooltip'
import { describedBy, tabIndexFor, tooltipShows } from './linearChartKeys'
import { StepKeysHint } from './StepKeysHint'
import type { AnnotationDot, ChartAnnotations, RefHighlight } from './chartReferenceLayers'
import type { LabeledMarker, LifeEventMarker } from './linearChartParts'
import type { StartMark } from './ChartStartMarks'
import { useChartFocus, type ChartFocusOptions } from './useChartFocus'
import { useSvgAnchor } from './useSvgAnchor'
import type { ScatterPoint } from './linearScale'
import type { ValueTagSpec } from './valueTags'
import { useChartBox, useGeometry, type ChartGeometry } from './linearChartGeometry'
import { ChartFocusLayers, ChartLineLayers, ChartPlotLayers } from './linearChartLayers'
import { ChartMarkLayers } from './linearChartMarkLayers'
import styles from './charts.module.css'

export type { ScatterPoint, AnnotationDot, ChartAnnotations }

/**
 * A reference that moves across the chart, drawn as a thin dashed line: a target in the other money,
 * which rises or falls with the inflation between one year and the next. One value per x place. It is
 * not a series, so it has no focus dot and no tooltip row, and it does not set the axis (it is clipped
 * where it leaves the plot).
 */
export interface ChartRefCurve {
  id: string
  values: number[]
}

export interface ChartSeries {
  id: string
  color: string
  /**
   * Projection values aligned to x-axis indices. For 'scatter' kind, pass [].
   * A line may have fewer values than the axis has places, and then it ends where its values do:
   * the axis is as long as the longest one.
   */
  values: number[]
  /**
   * For a line: what each place reached just before its value, where a payment or event lands on
   * it. The line climbs to this and drops straight to `values`, instead of sloping across the year.
   * Aligned to `values`; a place with nothing to say, or no entry, has no step.
   */
  preStep?: number[]
  kind?: 'line' | 'area' | 'scatter' | 'band'
  dashed?: boolean
  width?: number
  /**
   * Where each value sits on the x axis, for a line or band that does not start on one of the axis'
   * places (a scenario that starts part-way along it). Aligned to `values` (and the band's edges),
   * increasing. Without it value i sits at place i.
   */
  xs?: number[]
  /** Paired lower/upper envelope values, and what each reached just before (as `preStep`). Used only when kind === 'band'. */
  band?: { lo: number[]; hi: number[]; loPre?: number[]; hiPre?: number[] }
  /** Sparse check-in actuals. Used only when kind === 'scatter'. */
  points?: ScatterPoint[]
  /** Join scatter points in x order, so readings over time read as a line. */
  connect?: boolean
  /** Draw a marker at each point. Off for a projection given as points, which is a line. */
  dots?: boolean
  /**
   * A projection given as points that is read like a line: at the focused year it gets a value tag
   * (when the chart has them) and a hollow dot. Without it a scatter series is only its readings.
   */
  tagged?: boolean
}

export interface LinearChartProps {
  height: number
  /**
   * Room above the plot, for the top axis label to sit in. A chart with little height to spare
   * can ask for less than the default.
   */
  padTop?: number
  series: ChartSeries[]
  xLabels: string[]
  formatValue: (v: number) => string
  ariaLabel: string
  tooltip: (index: number) => { title: string; lines: TooltipLine[] }
  refLines?: number[]
  /** Reference lines that are not flat; see `ChartRefCurve`. */
  refCurves?: ChartRefCurve[]
  /** The reference line picked to stand out, drawn bright and solid while the others fade: a flat line's value, or a curve's id. */
  refHighlight?: RefHighlight
  /** Marks on the picked line: where each path reaches it, and a note at its right end. */
  annotations?: ChartAnnotations | undefined
  /** Where lines that start part-way along the axis begin; see `ChartStartMarks`. */
  startMarks?: StartMark[] | undefined
  /** How many of the axis' places to show at least, where it runs on past every line drawn. */
  places?: number | undefined
  markerYears?: { yearIndex: number }[]
  /** Life event markers: fractional x-axis indices with labels (e.g. year 3 → yearIndex 3). */
  lifeEventMarkers?: LifeEventMarker[]
  /** Turning points the chart names: a dashed line across the plot with its label (see `ChartLabeledMarkers`). */
  labeledMarkers?: readonly LabeledMarker[]
  /** Index of the current year in the x-axis for a "today" vertical marker. */
  todayIndex?: number
  tooltipMode?: 'full' | 'hidden'
  /** Passed straight through to `ChartTooltip`; see its own doc comment. Defaults to true. */
  dockBelow?: boolean | undefined
  /** A target above the top of the chart (the FI number), marked on its top edge instead of stretching the axis to it. */
  aboveTop?: { label: string; title: string } | undefined
  onActiveIndexChange?: (index: number | null) => void
  /** Floor for the auto-computed Y-axis max: holds the scale still while what is drawn changes (a previewed inflation rate). */
  yDomainMax?: number | undefined
  /** Fit the Y axis to the values in view instead of anchoring it at zero. */
  fitDomain?: boolean
  /** How the focused year behaves; see `ChartFocusOptions`. Absent, it clears as it always has. */
  focus?: ChartFocusOptions
  /**
   * Draw at the height of the box the chart is in, which the caller gives a height of its own,
   * instead of at `height` (which is then only what it is drawn at before the box is measured).
   */
  fillHeight?: boolean
  /** Tag each line's value at the focused year with a chip beside its dot; see `ChartValueTags`. */
  valueTags?: ValueTagSpec | undefined
}

function wrapClass(fillHeight: boolean | undefined): string | undefined {
  return fillHeight ? `${styles.chartWrap} ${styles.chartWrapFill}` : styles.chartWrap
}

/**
 * The focused year, from hover, touch or keys, and its tooltip: told to the caller as it changes, and the one tooltip
 * open on the page while it shows.
 */
function useFocusedTooltip(
  geo: ChartGeometry,
  svgRef: RefObject<SVGSVGElement | null>,
  containerRef: RefObject<HTMLDivElement | null>,
  { focus, tooltip, tooltipMode = 'full', onActiveIndexChange }: LinearChartProps,
) {
  const { active, ...handlers } = useChartFocus(geo.n, geo.xForIndex, containerRef, focus)
  const focusX = active != null ? geo.xForIndex(active) : 0
  const anchor = useSvgAnchor(svgRef, active != null ? focusX : null, active != null ? geo.padTop : null)
  const tip = active != null ? tooltip(active) : null
  const showsTooltip = tooltipShows(tip, tooltipMode)

  useEffect(() => {
    onActiveIndexChange?.(active)
  }, [active, onActiveIndexChange])

  // Only one chart's tooltip stays open at a time across the page: claiming the registry
  // closes whoever had it before. Gated on showsTooltip, not `active`, so a chart tracking
  // focus without ever rendering a tooltip (tooltipMode="hidden") can never close a real one.
  useEffect(() => {
    if (showsTooltip) claimActiveTooltip(handlers.onBlur)
    else releaseActiveTooltip(handlers.onBlur)
    return () => releaseActiveTooltip(handlers.onBlur)
  }, [showsTooltip, handlers.onBlur])
  return { active, handlers, focusX, anchor, tip, showsTooltip }
}

export function LinearChart(props: LinearChartProps) {
  const { height, padTop, series, formatValue, ariaLabel, refLines = [], places, yDomainMax, fitDomain } = props
  const { tooltipMode = 'full', dockBelow, onActiveIndexChange, fillHeight } = props
  const svgRef = useRef<SVGSVGElement>(null)
  // useId can return characters (colons, in older React) that a url(#...) reference does not take.
  const uid = useId().replace(/:/g, '')
  const plotClipId = `plot-${uid}`
  const keysId = `keys-${uid}`
  const containerRef = useRef<HTMLDivElement>(null)
  // The viewBox is the wrapper's width in CSS pixels, so text, strokes and hit areas
  // render at their own size instead of being scaled up with the chart.
  const { width, height: drawnHeight } = useChartBox(containerRef, height, fillHeight)
  const geo = useGeometry(series, width, drawnHeight, refLines, yDomainMax, fitDomain, padTop, places)
  const { active, handlers, focusX, anchor, tip, showsTooltip } = useFocusedTooltip(geo, svgRef, containerRef, props)
  const lineSeries = series.filter((s) => s.kind !== 'area' && s.kind !== 'band' && s.kind !== 'scatter')
  // A chart that takes focus can be stepped through with the keyboard, which nothing on it says.
  const steppable = tabIndexFor(tooltipMode, onActiveIndexChange) === 0

  return (
    <div ref={containerRef} className={wrapClass(fillHeight)}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${drawnHeight}`}
        className={styles.svg}
        role="img"
        aria-label={ariaLabel}
        {...describedBy(steppable, keysId)}
        tabIndex={tabIndexFor(tooltipMode, onActiveIndexChange)}
        onContextMenu={(e) => e.preventDefault()}
        {...handlers}
      >
        <ChartPlotLayers
          series={series}
          geo={geo}
          width={width}
          formatValue={formatValue}
          plotClipId={plotClipId}
          refCurves={props.refCurves}
          refHighlight={props.refHighlight}
        />
        <ChartLineLayers series={series} lineSeries={lineSeries} geo={geo} />
        <ChartMarkLayers {...props} geo={geo} width={width} drawnHeight={drawnHeight} active={active} />
        <ChartFocusLayers
          series={series}
          lineSeries={lineSeries}
          valueTags={props.valueTags}
          geo={geo}
          width={width}
          active={active}
          focusX={focusX}
        />
      </svg>
      <StepKeysHint id={keysId} show={steppable} />
      {tip && showsTooltip ? (
        <ChartTooltip anchor={anchor} chart={containerRef} title={tip.title} lines={tip.lines} dockBelow={dockBelow} />
      ) : null}
    </div>
  )
}
