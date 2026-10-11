import { memo, useCallback, useMemo } from 'react'
import { useAssumedInflation } from '../../..//hooks/assumedInflationContext'
import type { NewGoalScenario } from '../../../../data/dataSource'
import { lineValues, projectNetWorth, projectNetWorthBand, scenarioToParams } from '../../../../engine'
import { LinearChart, type ChartSeries } from '../../../charts/LinearChart'
import { formatMoneyShort } from '../chartTheme'
import { useMediaQuery } from '../../../hooks/useMediaQuery'
import { useMoneyFormat } from '../../../hooks/moneyFormatContext'
import { chartMoneyLabel } from '../planMoneyLabel'
import styles from './NetWorthMiniChart.module.css'

/** Room above the plot: the top axis label's half height, and no more, since this chart is pinned. */
const MINI_PAD_TOP = 8
const MINI_HEIGHT = 112
/** A phone this short has little left for controls once the header, the row and this chart are
 *  pinned, so the chart gives some back. The device's height, not the window's: the window's
 *  changes as Safari's toolbars come and go, and a chart that resized while scrolling would jump. */
const SHORT_DEVICE_MQ = '(max-device-height: 700px)'
const MINI_HEIGHT_SHORT = 96
const LABEL = 'Projection of the scenario being edited'

/**
 * The readout sits in the plot's top-left, where a line that starts low and ends top-right has
 * not got to. A low return against a large balance runs near the top the whole way, so it moves
 * to the bottom-left then. Judged on the first 55% of the line, which is as far as the readout
 * reaches on a 320px phone, against the top 40% and bottom 40% of its range, a little more than
 * the readout covers.
 */
function readoutSide(values: number[]): 'top' | 'bottom' {
  const peak = Math.max(...values)
  const reach = values.slice(0, Math.ceil(values.length * 0.55))
  const hits = (inRange: (v: number) => boolean) => reach.some(inRange)
  return hits((v) => v > 0.6 * peak) && !hits((v) => v < 0.4 * peak) ? 'bottom' : 'top'
}

/**
 * The scenario being edited, and nothing else: its line and its return band, with the
 * first and last year labelled. Pinned above the controls on a phone so a slider can be tuned
 * against the line it moves; the hero chart carries the legend, milestones and markers.
 */
function NetWorthMiniChartImpl({ draft }: { draft: NewGoalScenario }) {
  const format = useMoneyFormat()
  const inflationRate = useAssumedInflation()
  const height = useMediaQuery(SHORT_DEVICE_MQ) ? MINI_HEIGHT_SHORT : MINI_HEIGHT
  const { series, labels, end, side } = useMemo(() => {
    const params = scenarioToParams({ ...draft, id: 0 }, inflationRate)
    const points = projectNetWorth(params)
    const band: ChartSeries = {
      id: 'band',
      color: draft.color,
      values: [],
      kind: 'band',
      band: projectNetWorthBand(params),
    }
    const line: ChartSeries = {
      id: 'draft',
      color: draft.color,
      ...lineValues(points),
      width: 2,
    }
    const last = points.length - 1
    return {
      series: [band, line],
      labels: points.map((p, i) => (i === 0 || i === last ? String(p.year) : '')),
      end: points[last],
      side: readoutSide(line.values),
    }
  }, [draft, inflationRate])
  const tooltip = useCallback((i: number) => ({ title: `Year ${i}`, lines: [] }), [])
  // The pill and the chart's name read from the same figure, so a screen reader hears what a
  // sighted viewer sees, and the pill itself is hidden from it.
  const readout = end ? { year: end.year, money: formatMoneyShort(end.investedCents, format) } : null
  const money = chartMoneyLabel(draft.planStartDate, false, format)

  return (
    <div className={styles.wrap}>
      <LinearChart
        height={height}
        padTop={MINI_PAD_TOP}
        series={series}
        xLabels={labels}
        formatValue={(c) => formatMoneyShort(c, format)}
        ariaLabel={readout ? `${LABEL}, ${money}, ending at ${readout.money} in year ${readout.year}` : LABEL}
        tooltip={tooltip}
        tooltipMode="hidden"
      />
      {readout ? (
        <span className={styles.readout} data-side={side} aria-hidden="true">
          Year {readout.year} · {readout.money}
        </span>
      ) : null}
    </div>
  )
}

export const NetWorthMiniChart = memo(NetWorthMiniChartImpl)
