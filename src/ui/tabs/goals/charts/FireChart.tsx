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
import type { TooltipLine } from '../../../charts/ChartTooltip'
import { sparseLabels } from '../../../charts/linearScale'
import { formatEuroShort } from '../chartTheme'
import styles from '../goals.module.css'

function FireChartImpl({ draft }: { draft: NewGoalScenario }) {
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
        portfolio with constant real withdrawal.
      </p>
      <LinearChart
        height={210}
        series={series}
        xLabels={labels}
        refLines={[fiTarget]}
        formatValue={formatEuroShort}
        ariaLabel="FIRE drawdown projection by year"
        tooltip={tooltip}
      />
    </Card>
  )
}

export const FireChart = memo(FireChartImpl)
