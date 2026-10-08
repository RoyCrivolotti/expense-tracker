import { memo, useMemo } from 'react'
import { useAssumedInflation } from '../../..//hooks/assumedInflationContext'
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

const BALANCE_COLOR = '#8b5cf6'

const FIRE_LEGEND: LegendItem[] = [
  { label: 'Portfolio balance', color: BALANCE_COLOR },
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
  const inflationRate = useAssumedInflation()
  const { fiTarget, fiYear, balances } = useMemo(() => {
    const params = scenarioToParams({ ...draft, id: 0 }, inflationRate)
    const target = fireNumber(draft.annualSpendCents, draft.safeWithdrawalRate)
    const year = yearsToFi(params, draft.annualSpendCents, draft.safeWithdrawalRate)
    const growth = projectNetWorth(params)
    // Drawn from the year FI is reached. Where it never is there is no balance to draw: starting
    // the line at the target would show a portfolio the plan does not have.
    const drawdown =
      year == null
        ? []
        : projectDrawdown(
            growth[year]?.investedCents ?? target,
            draft.annualSpendCents,
            draft.expectedRealReturn,
            Math.min(30, draft.horizonYears),
          )
    return { fiTarget: target, fiYear: year, balances: drawdown }
  }, [draft, inflationRate])

  const format = useMoneyFormat()
  const labels = useMemo(() => sparseLabels(balances.map((_, y) => y), 5), [balances])
  const series: ChartSeries[] = [{ id: 'balance', color: BALANCE_COLOR, values: balances, width: 2 }]

  const tooltip = (i: number): { title: string; lines: TooltipLine[] } => ({
    title: `Year ${i}`,
    lines: [{ label: 'Portfolio', value: formatMoneyShort(balances[i] ?? 0, format), color: BALANCE_COLOR, tone: 'neutral' }],
  })

  if (fiYear == null) {
    return (
      <ChartShell embedded={embedded}>
        <h3 className={styles.chartTitle}>FI drawdown</h3>
        <p className={styles.chartHint}>
          FI target {formatMoneyShort(fiTarget, format)} · not reached in the horizon, so there is no
          drawdown to show.
        </p>
      </ChartShell>
    )
  }

  return (
    <ChartShell embedded={embedded}>
      <h3 className={styles.chartTitle}>FI drawdown</h3>
      <p className={styles.chartHint}>
        FI target {formatMoneyShort(fiTarget, format)} · reached year {fiYear}. Post-FI only: year 0 on
        this chart is the FI year, not today. After that it takes the plan's return every year and
        withdraws a constant amount in today's money, so it illustrates the target and is not a
        forecast: a bad run of early years would leave less.
      </p>
      <LinearChart
        height={height}
        series={series}
        xLabels={labels}
        refLines={[fiTarget]}
        formatValue={(c) => formatMoneyShort(c, format)}
        ariaLabel="FI drawdown projection by year"
        tooltip={tooltip}
      />
      <ChartLegend items={FIRE_LEGEND} />
    </ChartShell>
  )
}

export const FireChart = memo(FireChartImpl)
