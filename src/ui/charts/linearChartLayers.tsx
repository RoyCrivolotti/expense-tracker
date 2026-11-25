import { ChartBandLayer, ChartFocusIndicator, ChartGrid, ChartScatterLayer } from './chartDataLayers'
import { ChartRefCurves, type RefHighlight } from './chartReferenceLayers'
import { ChartValueTags } from './ChartValueTags'
import type { ChartRefCurve, ChartSeries, LinearChartProps } from './LinearChart'
import { PAD, type ChartGeometry } from './linearChartGeometry'
import { placeX, steppedPoints } from './steppedPoints'
import { linePath } from './linearScale'

interface PlotLayersProps {
  series: ChartSeries[]
  geo: ChartGeometry
  width: number
  formatValue: (v: number) => string
  plotClipId: string
  refCurves: ChartRefCurve[] | undefined
  refHighlight: RefHighlight
}

/** The grid, the stacked areas, and the bands and moving references, which are clipped to the plot. */
export function ChartPlotLayers({
  series,
  geo,
  width,
  formatValue,
  plotClipId,
  refCurves,
  refHighlight,
}: PlotLayersProps) {
  return (
    <>
      <ChartGrid ticks={geo.ticks} scaleY={geo.scaleY} x0={PAD.left} x1={width - PAD.right} formatValue={formatValue} />
      {geo.areaSeries.map((s, ai) => {
        const band = geo.stackedBands[ai]
        if (!band) return null
        return (
          <ChartBandLayer
            key={s.id}
            color={s.color}
            lo={band.lo}
            hi={band.hi}
            xForIndex={geo.xForIndex}
            scaleY={geo.scaleY}
            fillOpacity={0.4}
          />
        )
      })}
      <clipPath id={plotClipId}>
        <rect x={PAD.left - 1} y={geo.padTop} width={geo.innerW + 2} height={geo.innerH + 1} />
      </clipPath>
      <g clipPath={`url(#${plotClipId})`}>
        {series
          .filter((s) => s.kind === 'band')
          .map((s) =>
            s.band ? (
              <ChartBandLayer
                key={s.id}
                color={s.color}
                lo={s.band.lo}
                hi={s.band.hi}
                loPre={s.band.loPre}
                hiPre={s.band.hiPre}
                xForIndex={placeX(s, geo.xForIndex)}
                scaleY={geo.scaleY}
                fillOpacity={0.18}
              />
            ) : null,
          )}
        <ChartRefCurves curves={refCurves} xForIndex={geo.xForIndex} scaleY={geo.scaleY} highlight={refHighlight} />
      </g>
    </>
  )
}

/** The lines and the scatter series, over the bands. */
export function ChartLineLayers({
  series,
  lineSeries,
  geo,
}: {
  series: ChartSeries[]
  lineSeries: ChartSeries[]
  geo: ChartGeometry
}) {
  return (
    <>
      {lineSeries.map((s) => (
        <path
          key={s.id}
          d={linePath(steppedPoints(s.values, s.preStep, placeX(s, geo.xForIndex), geo.scaleY))}
          style={{ stroke: s.color }}
          fill="none"
          strokeWidth={s.width ?? 2}
          strokeDasharray={s.dashed ? '6 4' : undefined}
        />
      ))}
      {series
        .filter((s) => s.kind === 'scatter')
        .map((s) => (
          <ChartScatterLayer
            key={s.id}
            color={s.color}
            points={s.points ?? []}
            xForIndex={geo.xForIndex}
            scaleY={geo.scaleY}
            connect={s.connect ?? false}
            dashed={s.dashed ?? false}
            dots={s.dots ?? true}
          />
        ))}
    </>
  )
}

/** The crosshair and dots at the focused year, and the value tags beside them. */
export function ChartFocusLayers({
  series,
  lineSeries,
  valueTags,
  geo,
  width,
  active,
  focusX,
}: {
  series: ChartSeries[]
  lineSeries: ChartSeries[]
  valueTags: LinearChartProps['valueTags']
  geo: ChartGeometry
  width: number
  active: number | null
  focusX: number
}) {
  return (
    <>
      <ChartFocusIndicator
        active={active}
        focusX={focusX}
        yTop={geo.padTop}
        innerH={geo.innerH}
        scaleY={geo.scaleY}
        lineSeries={lineSeries}
      />
      <ChartValueTags
        spec={valueTags}
        active={active}
        focusX={focusX}
        width={width}
        yTop={geo.padTop}
        yBottom={geo.padTop + geo.innerH}
        scaleY={geo.scaleY}
        lines={lineSeries}
        bands={series.filter((s) => s.kind === 'band')}
        pointLines={series.flatMap((s) =>
          s.tagged && s.points ? [{ id: s.id, color: s.color, points: s.points }] : [],
        )}
      />
    </>
  )
}
