import { memo, useMemo } from 'react'
import type { NewGoalScenario } from '../../../../data/dataSource'
import { projectNetWorth, purchaseYearBreakdown, scenarioToParams } from '../../../../engine'
import { ChartShell } from './ChartShell'
import { LinearChart, type ChartSeries } from '../../../charts/LinearChart'
import { ChartLegend, type LegendItem } from '../../../charts/ChartLegend'
import type { TooltipLine } from '../../../charts/ChartTooltip'
import { sparseLabels } from '../../../charts/linearScale'
import { formatEuroShort } from '../chartTheme'
import { purchaseBreakdownTooltipLines } from '../purchaseTooltip'
import styles from '../goals.module.css'

const COMPOSITION_LEGEND: LegendItem[] = [
  { label: 'Invested portfolio', color: 'var(--exp-investment)' },
  { label: 'House equity', color: 'var(--exp-income)' },
  { label: 'Mortgage owed', color: 'var(--exp-danger)' },
]

function CompositionChartImpl({
  draft,
  height = 230,
  embedded = false,
}: {
  draft: NewGoalScenario
  height?: number
  embedded?: boolean
}) {
  const points = useMemo(
    () => projectNetWorth(scenarioToParams({ ...draft, id: 0 })),
    [draft],
  )
  const years = points.map((p) => p.year)
  const labels = useMemo(() => sparseLabels(years, 5), [years])

  const series: ChartSeries[] = [
    {
      id: 'invested',
      color: 'var(--exp-investment)',
      kind: 'area',
      values: points.map((p) => p.investedCents),
    },
    {
      id: 'house',
      color: 'var(--exp-income)',
      kind: 'area',
      values: points.map((p) => p.houseEquityCents),
    },
    {
      id: 'mortgage',
      color: 'var(--exp-danger)',
      kind: 'area',
      values: points.map((p) => -p.mortgageBalanceCents),
    },
  ]

  const tooltip = (i: number): { title: string; lines: TooltipLine[] } => {
    const p = points[i]
    const year = years[i] ?? i
    const lines: TooltipLine[] = [
      { label: 'Invested', value: formatEuroShort(p?.investedCents ?? 0), tone: 'neutral' },
      { label: 'House equity', value: formatEuroShort(p?.houseEquityCents ?? 0), tone: 'neutral' },
      { label: 'Mortgage', value: formatEuroShort(p?.mortgageBalanceCents ?? 0), tone: 'neutral' },
      {
        label: 'Net worth',
        value: formatEuroShort(p?.netWorthCents ?? 0),
        tone: 'neutral',
      },
    ]
    const breakdown = purchaseYearBreakdown(scenarioToParams({ ...draft, id: 0 }), year)
    if (breakdown) lines.push(...purchaseBreakdownTooltipLines(breakdown))
    return { title: `Year ${year}`, lines }
  }

  return (
    <ChartShell embedded={embedded}>
      <h3 className={styles.chartTitle}>Net worth composition</h3>
      <p className={styles.chartHint}>
        Invested portfolio + house equity − mortgage for the scenario you are editing.
      </p>
      <LinearChart
        height={height}
        series={series}
        xLabels={labels}
        formatValue={formatEuroShort}
        ariaLabel="Net worth composition by year"
        tooltip={tooltip}
      />
      <ChartLegend items={COMPOSITION_LEGEND} />
    </ChartShell>
  )
}

export const CompositionChart = memo(CompositionChartImpl)
