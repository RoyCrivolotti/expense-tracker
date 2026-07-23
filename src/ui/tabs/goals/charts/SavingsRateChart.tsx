import { memo, useMemo } from 'react'
import type { NewGoalScenario } from '../../../../data/dataSource'
import { ChartShell } from './ChartShell'
import { LinearChart, type ChartSeries } from '../../../charts/LinearChart'
import { ChartLegend, type LegendItem } from '../../../charts/ChartLegend'
import type { TooltipLine } from '../../../charts/ChartTooltip'
import { sparseLabels } from '../../../charts/linearScale'
import { formatMoneyShort } from '../chartTheme'
import { useMoneyFormat } from '../../../hooks/moneyFormatContext'
import styles from '../goals.module.css'

export interface MonthlySaving {
  month: string
  netSavingCents: number
}

const LEGEND: LegendItem[] = [
  { label: 'Actual net saving', color: 'var(--exp-income)' },
  { label: 'Plan assumption', color: 'color-mix(in srgb, var(--color-text) 45%, transparent)' },
]

function monthLabel(month: string): string {
  const [year, mm] = month.split('-')
  return mm && year ? `${mm}/${year.slice(2)}` : month
}

function SavingsRateChartImpl({
  draft,
  monthly,
  height = 210,
  embedded = false,
}: {
  draft: NewGoalScenario
  monthly: MonthlySaving[]
  height?: number
  embedded?: boolean
}) {
  const format = useMoneyFormat()
  const recent = useMemo(() => monthly.slice(-18), [monthly])
  const labels = useMemo(() => {
    const step = Math.max(1, Math.ceil(recent.length / 6))
    return sparseLabels(
      recent.map((m) => monthLabel(m.month)),
      step,
    )
  }, [recent])

  if (recent.length === 0) {
    return (
      <ChartShell embedded={embedded}>
        <h3 className={styles.chartTitle}>Actual saving vs plan</h3>
        <p className={styles.chartHint}>No monthly history yet to compare against your plan.</p>
      </ChartShell>
    )
  }

  const series: ChartSeries[] = [
    { id: 'actual', color: 'var(--exp-income)', values: recent.map((m) => m.netSavingCents) },
  ]
  const tooltip = (i: number): { title: string; lines: TooltipLine[] } => ({
    title: recent[i]?.month ?? '',
    lines: [
      { label: 'Saved', value: formatMoneyShort(recent[i]?.netSavingCents ?? 0, format), tone: 'neutral' },
      { label: 'Plan', value: formatMoneyShort(draft.monthlyContributionCents, format), tone: 'neutral' },
    ],
  })

  return (
    <ChartShell embedded={embedded}>
      <h3 className={styles.chartTitle}>Actual saving vs plan</h3>
      <p className={styles.chartHint}>
        Monthly net saving from posted transactions vs the{' '}
        {formatMoneyShort(draft.monthlyContributionCents, format)}/mo this scenario assumes.
      </p>
      <LinearChart
        height={height}
        series={series}
        xLabels={labels}
        refLines={[draft.monthlyContributionCents]}
        formatValue={(c) => formatMoneyShort(c, format)}
        ariaLabel="Monthly net saving versus planned contribution"
        tooltip={tooltip}
      />
      <ChartLegend items={LEGEND} />
    </ChartShell>
  )
}

export const SavingsRateChart = memo(SavingsRateChartImpl)
