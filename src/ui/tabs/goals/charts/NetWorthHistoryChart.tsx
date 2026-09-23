import { useCallback, useMemo, useState } from 'react'
import type { WealthAccount, WealthCheckin } from '../../../../types'
import { Card } from '../../../components/primitives'
import { SegmentedControl } from '../../../components/SegmentedControl'
import { LinearChart, type ChartSeries } from '../../../charts/LinearChart'
import type { ScatterPoint } from '../../../charts/linearScale'
import { ChartLegend } from '../../../charts/ChartLegend'
import type { TooltipLine } from '../../../charts/ChartTooltip'
import { checkinInvestedCents, checkinNetWorthCents } from '../../../../engine'
import { todayIso } from '../../../components/transactionFormState'
import { formatMoneyAxis, formatMoneyShort } from '../chartTheme'
import { useMoneyFormat } from '../../../hooks/moneyFormatContext'
import { useGoalsNarrow } from '../useGoalsNarrow'
import { nearestScatterValue } from './checkinChartUtils'
import { WINDOW_OPTIONS, type WindowKey } from './checkinWindow'
import { defaultHistoryWindow, historyAxis, xIndexFor } from './historyWindow'
import goalStyles from '../goals.module.css'
import progressStyles from '../progress.module.css'

interface Props {
  checkins: WealthCheckin[]
  accounts: WealthAccount[]
}

const NET_WORTH_COLOR = '#6366f1'
/** The same green as Actual on the plan chart: both are the invested balance from check-ins. */
const INVESTED_COLOR = '#10b981'

/** The net worth reading nearest each axis step, in x. */
function nearestByStep(points: ScatterPoint[], steps: number): number[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    let best = points[0]
    for (const p of points) {
      if (best === undefined || Math.abs(p.xIndex - i) < Math.abs(best.xIndex - i)) best = p
    }
    return best?.value ?? 0
  })
}

export function NetWorthHistoryChart({ checkins, accounts }: Props) {
  const format = useMoneyFormat()
  const narrow = useGoalsNarrow()
  const today = todayIso()
  const sorted = useMemo(
    () => [...checkins].sort((a, b) => a.checkinDate.localeCompare(b.checkinDate)),
    [checkins],
  )
  const earliest = sorted[0]?.checkinDate ?? null
  const [chosen, setChosen] = useState<WindowKey | null>(null)
  const window = chosen ?? defaultHistoryWindow(earliest, today)

  const model = useMemo(() => {
    // Five month labels run into each other on a phone; three fit.
    const axis = historyAxis(window, earliest, today, narrow ? 3 : 5)
    const placed = sorted
      .map((c) => ({ x: xIndexFor(c.checkinDate, today, axis), c }))
      .filter(({ x }) => x >= 0 && x <= axis.steps)
    const netWorth = placed.map(({ x, c }) => ({ xIndex: x, value: checkinNetWorthCents(c, accounts) }))
    const invested = placed.map(({ x, c }) => ({ xIndex: x, value: checkinInvestedCents(c, accounts) }))
    // The chart lays its x axis out from a line series, so an unseen one carries the calendar.
    // It holds the nearest net worth at each step, which keeps the fitted y axis unchanged.
    const carrier = nearestByStep(netWorth, axis.steps)
    const shown = [...netWorth, ...invested].map((p) => p.value)
    const tickStep = shown.length > 0 ? (Math.max(...shown) - Math.min(...shown)) / 5 : 0
    return { axis, netWorth, invested, carrier, tickStep }
  }, [window, earliest, today, sorted, accounts, narrow])

  const tooltip = useCallback(
    (i: number): { title: string; lines: TooltipLine[] } => {
      const lines: TooltipLine[] = []
      const netWorth = nearestScatterValue(model.netWorth, i)
      const invested = nearestScatterValue(model.invested, i)
      if (netWorth !== null) {
        lines.push({ label: 'Net worth', value: formatMoneyShort(netWorth, format), color: NET_WORTH_COLOR })
      }
      if (invested !== null) {
        lines.push({ label: 'Invested', value: formatMoneyShort(invested, format), color: INVESTED_COLOR })
      }
      return { title: model.axis.titles[i] ?? String(i), lines }
    },
    [model, format],
  )

  if (sorted.length === 0) return null
  if (sorted.length < 2) {
    return (
      <Card>
        <h3 className={goalStyles.sectionTitle}>Net worth over time</h3>
        <p className={progressStyles.emptyHint}>Log a second check-in to see how it has moved.</p>
      </Card>
    )
  }

  const series: ChartSeries[] = [
    { id: 'calendar', color: 'transparent', values: model.carrier },
    { id: 'net-worth', color: NET_WORTH_COLOR, values: [], kind: 'scatter', points: model.netWorth, connect: true },
    { id: 'invested', color: INVESTED_COLOR, values: [], kind: 'scatter', points: model.invested, connect: true },
  ]

  return (
    <Card>
      <div className={progressStyles.chartHeaderRow}>
        <h3 className={goalStyles.sectionTitle}>Net worth over time</h3>
        <SegmentedControl
          options={WINDOW_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          value={window}
          onChange={setChosen}
          ariaLabel="History window"
          layout="compact"
        />
      </div>
      <LinearChart
        height={narrow ? 180 : 220}
        series={series}
        xLabels={model.axis.labels}
        refLines={[]}
        markerYears={[]}
        fitDomain
        formatValue={(c) => formatMoneyAxis(c, format, model.tickStep)}
        ariaLabel="Net worth and invested balance by check-in"
        tooltip={tooltip}
      />
      <ChartLegend
        items={[
          { label: 'Net worth', color: NET_WORTH_COLOR },
          { label: 'Invested', color: INVESTED_COLOR },
        ]}
      />
    </Card>
  )
}
