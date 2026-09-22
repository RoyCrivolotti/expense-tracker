import { useCallback, useMemo } from 'react'
import type { GoalScenario, WealthAccount, WealthCheckin } from '../../../../types'
import { Card } from '../../../components/primitives'
import { LinearChart, type ChartSeries } from '../../../charts/LinearChart'
import type { ScatterPoint } from '../../../charts/linearScale'
import { ChartLegend } from '../../../charts/ChartLegend'
import {
  projectNetWorth,
  scenarioToParams,
  yearOffsetFromDate,
  checkinInvestedCents,
} from '../../../../engine'
import { sparseLabels } from '../../../charts/linearScale'
import { formatMoneyShort } from '../chartTheme'
import { useMoneyFormat } from '../../../hooks/moneyFormatContext'
import { buildCheckinTooltip } from './checkinChartUtils'
import goalStyles from '../goals.module.css'

interface Props {
  checkins: WealthCheckin[]
  accounts: WealthAccount[]
  plan: GoalScenario | null
}

const ACTUAL_COLOR = '#10b981'

export function CheckinHistoryChart({ checkins, accounts, plan }: Props) {
  const format = useMoneyFormat()

  const { series, labels, todayIndex, years, scatterPoints } = useMemo(() => {
    if (!plan?.planStartDate) {
      return { series: [], labels: [], todayIndex: undefined, years: [] as number[], scatterPoints: [] as ScatterPoint[] }
    }

    const params = scenarioToParams(plan)
    const points = projectNetWorth(params)
    const yrs = points.map((p) => p.year)

    const projSeries: ChartSeries = {
      id: 'plan',
      color: plan.color,
      values: points.map((p) => p.investedCents),
      dashed: false,
    }

    const scatter: ScatterPoint[] = checkins
      .map((c) => {
        const offset = yearOffsetFromDate(plan.planStartDate!, c.checkinDate)
        if (offset === null) return null
        const value = checkinInvestedCents(c, accounts)
        return { xIndex: offset, value }
      })
      .filter((p): p is ScatterPoint => p !== null)

    const actualSeries: ChartSeries = {
      id: 'actuals',
      color: ACTUAL_COLOR,
      values: [],
      kind: 'scatter',
      points: scatter,
    }

    const todayOffset = yearOffsetFromDate(
      plan.planStartDate,
      new Date().toISOString().slice(0, 10),
    )

    return {
      series: [projSeries, actualSeries],
      labels: sparseLabels(yrs, 6).map((l) => (l === null ? '' : String(l))),
      todayIndex: todayOffset ?? undefined,
      years: yrs,
      scatterPoints: scatter,
    }
  }, [plan, checkins, accounts])

  const planColor = plan?.color
  const tooltip = useCallback(
    (i: number) => buildCheckinTooltip(i, years, series[0]?.values ?? [], scatterPoints, format, planColor, ACTUAL_COLOR),
    [years, series, scatterPoints, format, planColor],
  )

  if (!plan?.planStartDate) {
    return null
  }

  const legendItems = [
    { label: 'Plan', color: plan.color },
    { label: 'Actual', color: ACTUAL_COLOR },
  ]

  return (
    <Card>
      <h3 className={goalStyles.sectionTitle}>Actual vs plan</h3>
      <LinearChart
        height={180}
        series={series}
        xLabels={labels}
        refLines={[]}
        markerYears={[]}
        {...(todayIndex !== undefined ? { todayIndex } : {})}
        formatValue={(c) => formatMoneyShort(c, format)}
        ariaLabel="Actual wealth vs plan projection"
        tooltip={tooltip}
      />
      <ChartLegend items={legendItems} />
    </Card>
  )
}
