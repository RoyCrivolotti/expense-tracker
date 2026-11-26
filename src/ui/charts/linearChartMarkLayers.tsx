import { ChartXLabels } from './chartDataLayers'
import { ChartAnnotationLayer, ChartRefLines } from './chartReferenceLayers'
import {
  ChartAboveMarker,
  ChartLabeledMarkers,
  ChartLifeEventMarkers,
  ChartPurchaseMarkers,
  ChartTodayMarker,
} from './linearChartParts'
import { ChartStartMarks } from './ChartStartMarks'
import type { LinearChartProps } from './LinearChart'
import { PAD, type ChartGeometry } from './linearChartGeometry'

/** Reference lines closer than this run together into one dashed smear, so the nearer one is left out. */
const REF_LINE_MIN_GAP = 8

type MarkProps = Pick<
  LinearChartProps,
  | 'xLabels'
  | 'refLines'
  | 'refHighlight'
  | 'annotations'
  | 'startMarks'
  | 'markerYears'
  | 'lifeEventMarkers'
  | 'labeledMarkers'
  | 'todayIndex'
  | 'aboveTop'
>

/** The flat references, the start marks, the notes on the picked line, the markers and the axis labels. */
export function ChartMarkLayers({
  xLabels,
  refLines = [],
  refHighlight,
  annotations,
  startMarks,
  markerYears = [],
  lifeEventMarkers = [],
  labeledMarkers,
  todayIndex,
  aboveTop,
  geo,
  width,
  drawnHeight,
  active,
}: MarkProps & { geo: ChartGeometry; width: number; drawnHeight: number; active: number | null }) {
  return (
    <>
      <ChartRefLines
        values={refLines}
        scaleY={geo.scaleY}
        x1={PAD.left}
        x2={width - PAD.right}
        minGap={REF_LINE_MIN_GAP}
        highlight={refHighlight}
      />
      <ChartStartMarks
        marks={startMarks}
        geo={geo}
        left={PAD.left}
        right={width - PAD.right}
        active={active}
        annotations={annotations}
      />
      <ChartAnnotationLayer
        annotations={annotations}
        xForIndex={geo.xForIndex}
        scaleY={geo.scaleY}
        top={geo.padTop}
        right={width - PAD.right}
      />
      {todayIndex !== undefined && (
        <ChartTodayMarker x={geo.xForIndex(todayIndex)} yTop={geo.padTop} yBottom={geo.padTop + geo.innerH} />
      )}
      <ChartXLabels labels={xLabels} xForIndex={geo.xForIndex} y={drawnHeight - 8} />
      <ChartPurchaseMarkers markerYears={markerYears} xForIndex={geo.xForIndex} yTop={geo.padTop} innerH={geo.innerH} />
      <ChartLifeEventMarkers markers={lifeEventMarkers} xForIndex={geo.xForIndex} yTop={geo.padTop} />
      <ChartLabeledMarkers
        markers={labeledMarkers}
        xForIndex={geo.xForIndex}
        yTop={geo.padTop}
        innerH={geo.innerH}
        left={PAD.left}
        right={width - PAD.right}
      />
      {/* Above the year marks, or a dashed vertical mark runs through its text. */}
      <ChartAboveMarker marker={aboveTop} x={PAD.left + 8} y={geo.padTop} />
    </>
  )
}
