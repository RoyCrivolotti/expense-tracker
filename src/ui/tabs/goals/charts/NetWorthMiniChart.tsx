import { memo, useCallback, useMemo } from 'react'
import type { NewGoalScenario } from '../../../../data/dataSource'
import { projectNetWorth, projectNetWorthBand, scenarioToParams } from '../../../../engine'
import { LinearChart, type ChartSeries } from '../../../charts/LinearChart'
import { formatMoneyShort } from '../chartTheme'
import { useMoneyFormat } from '../../../hooks/moneyFormatContext'

const MINI_HEIGHT = 120

/**
 * The scenario being edited, and nothing else: its line and its uncertainty band, with the
 * first and last year labelled. Pinned above the controls on a phone so a slider can be tuned
 * against the line it moves; the hero chart carries the legend, milestones and markers.
 */
function NetWorthMiniChartImpl({ draft }: { draft: NewGoalScenario }) {
  const format = useMoneyFormat()
  const { series, labels } = useMemo(() => {
    const params = scenarioToParams({ ...draft, id: 0 })
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
  }, [draft])
  const tooltip = useCallback((i: number) => ({ title: `Year ${i}`, lines: [] }), [])

  return (
    <LinearChart
      height={MINI_HEIGHT}
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
