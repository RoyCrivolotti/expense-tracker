import { useMemo } from 'react'
import type { GoalScenario, WealthAccount, WealthCheckin } from '../../../../types'
import { Card } from '../../../components/primitives'
import { LinearChart, type ChartSeries } from '../../../charts/LinearChart'
import type { ScatterPoint } from '../../../charts/linearScale'
import {
  projectNetWorth,
  scenarioToParams,
  yearOffsetFromDate,
  checkinNetWorthCents,
} from '../../../../engine'
import { sparseLabels } from '../../../charts/linearScale'
import { formatMoneyShort } from '../chartTheme'
import { useMoneyFormat } from '../../../hooks/moneyFormatContext'
import goalStyles from '../goals.module.css'

interface Props {
  checkins: WealthCheckin[]
  accounts: WealthAccount[]
  activeScenario: GoalScenario | null
}

export function CheckinHistoryChart({ checkins, accounts, activeScenario }: Props) {
  const format = useMoneyFormat()

  const { series, labels, todayIndex } = useMemo(() => {
    if (!activeScenario?.planStartDate) {
      return { series: [], labels: [], todayIndex: undefined }
    }

    const params = scenarioToParams(activeScenario)
    const points = projectNetWorth(params)
    const years = points.map((p) => p.year)

    const projSeries: ChartSeries = {
      id: 'plan',
      color: activeScenario.color,
      values: points.map((p) => p.investedCents),
      dashed: false,
    }

    const scatterPoints: ScatterPoint[] = checkins
      .map((c) => {
        const offset = yearOffsetFromDate(activeScenario.planStartDate!, c.checkinDate)
        if (offset === null) return null
        const value = checkinNetWorthCents(c, accounts)
        return { xIndex: offset, value }
      })
      .filter((p): p is ScatterPoint => p !== null)

    const actualSeries: ChartSeries = {
      id: 'actuals',
      color: '#10b981',
      values: [],
      kind: 'scatter',
      points: scatterPoints,
    }

    const todayOffset = yearOffsetFromDate(
      activeScenario.planStartDate,
      new Date().toISOString().slice(0, 10),
    )

    return {
      series: [projSeries, actualSeries],
      labels: sparseLabels(years, 6).map((l) => (l === null ? '' : String(l))),
      todayIndex: todayOffset ?? undefined,
    }
  }, [activeScenario, checkins, accounts])

  if (!activeScenario?.planStartDate) {
    return null
  }

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
        tooltip={() => ({ title: '', lines: [] })}
        tooltipMode="hidden"
      />
    </Card>
  )
}
