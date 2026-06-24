import { memo, useMemo } from 'react'
import type { NewGoalScenario } from '../../../../data/dataSource'
import { projectNetWorth, scenarioToParams } from '../../../../engine'
import { Card } from '../../../components/primitives'
import { LinearChart, type ChartSeries } from '../../../charts/LinearChart'
import type { TooltipLine } from '../../../charts/ChartTooltip'
import { sparseLabels } from '../../../charts/linearScale'
import { formatEuroShort } from '../chartTheme'
import styles from '../goals.module.css'

function CompositionChartImpl({ draft }: { draft: NewGoalScenario }) {
  const points = useMemo(
    () => projectNetWorth(scenarioToParams({ ...draft, id: 0 })),
    [draft],
  )
  const years = points.map((p) => p.year)
  const labels = useMemo(() => sparseLabels(years, 5), [years])

  const series: ChartSeries[] = [
    { id: 'invested', color: '#6366f1', kind: 'area', values: points.map((p) => p.investedCents) },
    { id: 'house', color: '#10b981', kind: 'area', values: points.map((p) => p.houseEquityCents) },
    {
      id: 'mortgage',
      color: '#ef4444',
      kind: 'area',
      values: points.map((p) => -p.mortgageBalanceCents),
    },
  ]

  const tooltip = (i: number): { title: string; lines: TooltipLine[] } => {
    const p = points[i]
    return {
      title: `Year ${years[i] ?? i}`,
      lines: [
        { label: 'Invested', value: formatEuroShort(p?.investedCents ?? 0), tone: 'neutral' },
        { label: 'House equity', value: formatEuroShort(p?.houseEquityCents ?? 0), tone: 'neutral' },
        { label: 'Mortgage', value: formatEuroShort(p?.mortgageBalanceCents ?? 0), tone: 'neutral' },
      ],
    }
  }

  return (
    <Card className={styles.chartCard}>
      <h3 className={styles.chartTitle}>Net worth composition</h3>
      <p className={styles.chartHint}>
        Invested portfolio + house equity − mortgage for the scenario you are editing.
      </p>
      <LinearChart
        height={230}
        series={series}
        xLabels={labels}
        formatValue={formatEuroShort}
        ariaLabel="Net worth composition by year"
        tooltip={tooltip}
      />
    </Card>
  )
}

export const CompositionChart = memo(CompositionChartImpl)
