import { memo, useMemo } from 'react'
import type { NewGoalScenario } from '../../../../data/dataSource'
import {
  fireNumber,
  projectDrawdown,
  projectNetWorth,
  scenarioToParams,
  yearsToFi,
} from '../../../../engine'
import { Card } from '../../../components/primitives'
import { LinearChart, type ChartSeries } from '../../../charts/LinearChart'
import { ChartLegend, type LegendItem } from '../../../charts/ChartLegend'
import type { TooltipLine } from '../../../charts/ChartTooltip'
import { sparseLabels } from '../../../charts/linearScale'
import { formatEuroShort } from '../chartTheme'
import styles from '../goals.module.css'

const FIRE_LEGEND: LegendItem[] = [
  { label: 'Portfolio balance', color: '#8b5cf6' },
  { label: 'FI target', color: 'color-mix(in srgb, var(--color-text) 45%, transparent)' },
]

function FireChartImpl({
  draft,
  height = 210,
}: {
  draft: NewGoalScenario
  height?: number
}) {
  const { fiTarget, fiYear, balances } = useMemo(() => {
    const params = scenarioToParams({ ...draft, id: 0 })
    const target = fireNumber(draft.annualSpendCents, draft.safeWithdrawalRate)
    const year = yearsToFi(params, draft.annualSpendCents, draft.safeWithdrawalRate)
    const growth = projectNetWorth(params)
    const fiPortfolio = year != null ? (growth[year]?.netWorthCents ?? target) : target
    const drawdown = projectDrawdown(
      fiPortfolio,
      draft.annualSpendCents,
      draft.expectedRealReturn,
      Math.min(30, draft.horizonYears),
    )
    return { fiTarget: target, fiYear: year, balances: drawdown }
  }, [draft])

  const labels = useMemo(() => sparseLabels(balances.map((_, y) => y), 5), [balances])
  const series: ChartSeries[] = [{ id: 'balance', color: '#8b5cf6', values: balances, width: 2 }]

  const tooltip = (i: number): { title: string; lines: TooltipLine[] } => ({
    title: `Year ${i}`,
    lines: [{ label: 'Portfolio', value: formatEuroShort(balances[i] ?? 0), tone: 'neutral' }],
  })

  return (
    <Card className={styles.chartCard}>
      <h3 className={styles.chartTitle}>FIRE drawdown</h3>
      <p className={styles.chartHint}>
        FI target {formatEuroShort(fiTarget)}
        {fiYear != null ? ` · reached year ${fiYear}` : ' · not reached in horizon'}. Post-FI
        only: year 0 on this chart is the FI year, not today. Constant real withdrawal after that.
      </p>
      <LinearChart
        height={height}
        series={series}
        xLabels={labels}
        refLines={[fiTarget]}
        formatValue={formatEuroShort}
        ariaLabel="FIRE drawdown projection by year"
        tooltip={tooltip}
      />
      <ChartLegend items={FIRE_LEGEND} />
    </Card>
  )
}

export const FireChart = memo(FireChartImpl)
