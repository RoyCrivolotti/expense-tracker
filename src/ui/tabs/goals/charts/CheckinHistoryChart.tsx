import { useCallback, useMemo, useState } from 'react'
import type { GoalScenario, WealthAccount, WealthCheckin } from '../../../../types'
import { Card } from '../../../components/primitives'
import { SegmentedControl } from '../../../components/SegmentedControl'
import { LinearChart, type ChartSeries } from '../../../charts/LinearChart'
import type { ScatterPoint } from '../../../charts/linearScale'
import { ChartLegend } from '../../../charts/ChartLegend'
import {
  projectNetWorth,
  scenarioToParams,
  yearOffsetFromDate,
  checkinInvestedCents,
} from '../../../../engine'
import { todayIso } from '../../../components/transactionFormState'
import { formatMoneyAxis } from '../chartTheme'
import { useMoneyFormat } from '../../../hooks/moneyFormatContext'
import { useGoalsNarrow } from '../useGoalsNarrow'
import { buildCheckinTooltip } from './checkinChartUtils'
import { WINDOW_OPTIONS, defaultWindow, stepMonthsFor, windowSeries, type WindowKey } from './checkinWindow'
import goalStyles from '../goals.module.css'
import progressStyles from '../progress.module.css'

interface Props {
  checkins: WealthCheckin[]
  accounts: WealthAccount[]
  plan: GoalScenario | null
}

const ACTUAL_COLOR = '#10b981'

export function CheckinHistoryChart({ checkins, accounts, plan }: Props) {
  const format = useMoneyFormat()
  const narrow = useGoalsNarrow()
  const planStartDate = plan?.planStartDate ?? null
  const elapsedYears = useMemo(
    () => (planStartDate ? (yearOffsetFromDate(planStartDate, todayIso()) ?? 0) : 0),
    [planStartDate],
  )
  const [chosen, setChosen] = useState<WindowKey | null>(null)
  const window = chosen ?? defaultWindow(elapsedYears)

  const model = useMemo(() => {
    if (!plan || !planStartDate) return null
    const points = projectNetWorth(scenarioToParams(plan))
    const years = WINDOW_OPTIONS.find((o) => o.value === window)?.years ?? plan.horizonYears
    const windowYears = Math.min(years, plan.horizonYears)
    const series = windowSeries(points, planStartDate, windowYears, stepMonthsFor(windowYears))
    const scatter: ScatterPoint[] = checkins
      .map((c) => {
        const offset = yearOffsetFromDate(planStartDate, c.checkinDate)
        if (offset === null || offset < 0 || offset > windowYears) return null
        return { xIndex: offset / series.stepYears, value: checkinInvestedCents(c, accounts) }
      })
      .filter((p): p is ScatterPoint => p !== null)
    const todayIndex =
      elapsedYears >= 0 && elapsedYears <= windowYears ? elapsedYears / series.stepYears : undefined
    // Roughly one tick's worth of the fitted axis, so the labels get enough decimals.
    const shown = [...series.values, ...scatter.map((p) => p.value)]
    const tickStep = (Math.max(...shown) - Math.min(...shown)) / 5
    return { series, scatter, todayIndex, tickStep }
  }, [plan, planStartDate, window, checkins, accounts, elapsedYears])

  const planColor = plan?.color
  const tooltip = useCallback(
    (i: number) =>
      buildCheckinTooltip(
        i,
        model?.series.titles ?? [],
        model?.series.values ?? [],
        model?.scatter ?? [],
        format,
        planColor,
        ACTUAL_COLOR,
      ),
    [model, format, planColor],
  )

  if (!plan || !planStartDate || !model) return null

  const chartSeries: ChartSeries[] = [
    { id: 'plan', color: plan.color, values: model.series.values, dashed: false },
    {
      id: 'actuals',
      color: ACTUAL_COLOR,
      values: [],
      kind: 'scatter',
      points: model.scatter,
      // Joined, so the check-ins read as how the portfolio moved, not as stray dots.
      connect: true,
    },
  ]

  return (
    <Card>
      <div className={progressStyles.chartHeaderRow}>
        <h3 className={goalStyles.sectionTitle}>Actual vs plan</h3>
        <SegmentedControl
          options={WINDOW_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          value={window}
          onChange={setChosen}
          ariaLabel="Time window"
          layout="compact"
        />
      </div>
      <LinearChart
        height={narrow ? 180 : 220}
        series={chartSeries}
        xLabels={model.series.labels}
        refLines={[]}
        markerYears={[]}
        fitDomain
        {...(model.todayIndex !== undefined ? { todayIndex: model.todayIndex } : {})}
        formatValue={(c) => formatMoneyAxis(c, format, model.tickStep)}
        ariaLabel="Actual wealth vs plan projection"
        tooltip={tooltip}
      />
      <ChartLegend
        items={[
          { label: 'Plan', color: plan.color },
          { label: 'Actual', color: ACTUAL_COLOR },
        ]}
      />
    </Card>
  )
}
