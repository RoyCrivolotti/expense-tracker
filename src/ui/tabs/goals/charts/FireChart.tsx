import { memo, useMemo } from 'react'
import type { NewGoalScenario } from '../../../../data/dataSource'
import {
  fireNumber,
  projectDrawdown,
  projectNetWorth,
  scenarioToParams,
  yearsToFi,
} from '../../../../engine'
import { ChartShell } from './ChartShell'
import { LinearChart, type ChartSeries } from '../../../charts/LinearChart'
import { ChartLegend, type LegendItem } from '../../../charts/ChartLegend'
import type { TooltipLine } from '../../../charts/ChartTooltip'
import { sparseLabels } from '../../../charts/linearScale'
import { formatMoneyShort } from '../chartTheme'
import { useMoneyFormat } from '../../../hooks/moneyFormatContext'
import styles from '../goals.module.css'

const FIRE_LEGEND: LegendItem[] = [
  { label: 'Portfolio balance', color: '#8b5cf6' },
  { label: 'FI target', color: 'color-mix(in srgb, var(--color-text) 45%, transparent)' },
]

function FireChartImpl({
  draft,
  height = 210,
  embedded = false,
}: {
  draft: NewGoalScenario
  height?: number
  embedded?: boolean
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

  const format = useMoneyFormat()
  const labels = useMemo(() => sparseLabels(balances.map((_, y) => y), 5), [balances])
  const series: ChartSeries[] = [{ id: 'balance', color: '#8b5cf6', values: balances, width: 2 }]

  const tooltip = (i: number): { title: string; lines: TooltipLine[] } => ({
    title: `Year ${i}`,
    lines: [{ label: 'Portfolio', value: formatMoneyShort(balances[i] ?? 0, format), tone: 'neutral' }],
  })

  return (
    <ChartShell embedded={embedded}>
      <h3 className={styles.chartTitle}>FIRE drawdown</h3>
      <p className={styles.chartHint}>
        FI target {formatMoneyShort(fiTarget, format)}
        {fiYear != null ? ` · reached year ${fiYear}` : ' · not reached in horizon'}. Post-FI
        only: year 0 on this chart is the FI year, not today. Constant real withdrawal after that.
      </p>
      <LinearChart
        height={height}
        series={series}
        xLabels={labels}
        refLines={[fiTarget]}
        formatValue={(c) => formatMoneyShort(c, format)}
        ariaLabel="FIRE drawdown projection by year"
        tooltip={tooltip}
      />
      <ChartLegend items={FIRE_LEGEND} />
    </ChartShell>
  )
}

export const FireChart = memo(FireChartImpl)
