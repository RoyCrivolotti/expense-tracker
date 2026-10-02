import { memo, useCallback, useMemo } from 'react'
import { useAssumedInflation } from '../../..//hooks/assumedInflationContext'
import type { NewGoalScenario } from '../../../../data/dataSource'
import { projectNetWorth, projectNetWorthBand, scenarioToParams } from '../../../../engine'
import { LinearChart, type ChartSeries } from '../../../charts/LinearChart'
import { formatMoneyShort } from '../chartTheme'
import { useMediaQuery } from '../../../hooks/useMediaQuery'
import { useMoneyFormat } from '../../../hooks/moneyFormatContext'

/** Room above the plot: the top axis label's half height, and no more, since this chart is pinned. */
const MINI_PAD_TOP = 8
const MINI_HEIGHT = 112
/** A phone this short has little left for controls once the header, the row and this chart are
 *  pinned, so the chart gives some back. The device's height, not the window's: the window's
 *  changes as Safari's toolbars come and go, and a chart that resized while scrolling would jump. */
const SHORT_DEVICE_MQ = '(max-device-height: 700px)'
const MINI_HEIGHT_SHORT = 96

/**
 * The scenario being edited, and nothing else: its line and its uncertainty band, with the
 * first and last year labelled. Pinned above the controls on a phone so a slider can be tuned
 * against the line it moves; the hero chart carries the legend, milestones and markers.
 */
function NetWorthMiniChartImpl({ draft }: { draft: NewGoalScenario }) {
  const format = useMoneyFormat()
  const inflationRate = useAssumedInflation()
  const height = useMediaQuery(SHORT_DEVICE_MQ) ? MINI_HEIGHT_SHORT : MINI_HEIGHT
  const { series, labels } = useMemo(() => {
    const params = scenarioToParams({ ...draft, id: 0 }, inflationRate)
    const points = projectNetWorth(params)
    const { lo, hi } = projectNetWorthBand(params)
    const band: ChartSeries = {
      id: 'band',
      color: draft.color,
      values: [],
      kind: 'band',
      band: { lo, hi },
    }
    const line: ChartSeries = {
      id: 'draft',
      color: draft.color,
      values: points.map((p) => p.investedCents),
      width: 2,
    }
    const last = points.length - 1
    return {
      series: [band, line],
      labels: points.map((p, i) => (i === 0 || i === last ? String(p.year) : '')),
    }
  }, [draft, inflationRate])
  const tooltip = useCallback((i: number) => ({ title: `Year ${i}`, lines: [] }), [])

  return (
    <LinearChart
      height={height}
      padTop={MINI_PAD_TOP}
      series={series}
      xLabels={labels}
      formatValue={(c) => formatMoneyShort(c, format)}
      ariaLabel="Projection of the scenario being edited"
      tooltip={tooltip}
      tooltipMode="hidden"
    />
  )
}

export const NetWorthMiniChart = memo(NetWorthMiniChartImpl)
