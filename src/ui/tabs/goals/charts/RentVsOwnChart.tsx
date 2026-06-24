import { memo, useMemo } from 'react'
import type { NewGoalScenario } from '../../../../data/dataSource'
import { projectRentVsBuy, scenarioToParams } from '../../../../engine'
import { Card } from '../../../components/primitives'
import { LinearChart, type ChartSeries } from '../../../charts/LinearChart'
import { ChartLegend, type LegendItem } from '../../../charts/ChartLegend'
import type { TooltipLine } from '../../../charts/ChartTooltip'
import { sparseLabels } from '../../../charts/linearScale'
import { formatEuroShort } from '../chartTheme'
import styles from '../goals.module.css'

const LEGEND: LegendItem[] = [
  { label: 'Rent & invest', color: 'var(--exp-warning)' },
  { label: 'Buy now', color: 'var(--exp-investment)' },
]

function RentVsOwnChartImpl({ draft }: { draft: NewGoalScenario }) {
  const { points, breakevenYear } = useMemo(
    () =>
      projectRentVsBuy({
        params: scenarioToParams({ ...draft, id: 0 }),
        rentMonthlyCents: draft.rentMonthlyCents,
      }),
    [draft],
  )
  const years = points.map((p) => p.year)
  const labels = useMemo(() => sparseLabels(years, 5), [years])

  const series: ChartSeries[] = [
    { id: 'rent', color: 'var(--exp-warning)', values: points.map((p) => p.rentNetWorthCents) },
    { id: 'buy', color: 'var(--exp-investment)', values: points.map((p) => p.buyNetWorthCents) },
  ]

  const tooltip = (i: number): { title: string; lines: TooltipLine[] } => ({
    title: `Year ${years[i] ?? i}`,
    lines: [
      { label: 'Rent & invest', value: formatEuroShort(points[i]?.rentNetWorthCents ?? 0), tone: 'neutral' },
      { label: 'Buy now', value: formatEuroShort(points[i]?.buyNetWorthCents ?? 0), tone: 'neutral' },
    ],
  })

  if (points.length === 0) {
    return (
      <Card className={styles.chartCard}>
        <h3 className={styles.chartTitle}>Rent vs buy</h3>
        <p className={styles.chartHint}>Set a house price to compare renting against buying now.</p>
      </Card>
    )
  }

  return (
    <Card className={styles.chartCard}>
      <h3 className={styles.chartTitle}>Rent vs buy (net worth)</h3>
      <p className={styles.chartHint}>
        {breakevenYear != null
          ? `Buying overtakes renting around year ${breakevenYear}.`
          : 'Renting and investing stays ahead across the whole horizon.'}{' '}
        Higher is better. The renter invests the down payment plus any monthly surplus; assumes
        constant real rent and 1.5%/yr home carry costs.
      </p>
      <LinearChart
        height={210}
        series={series}
        xLabels={labels}
        formatValue={formatEuroShort}
        ariaLabel="Net worth from renting versus buying by year"
        tooltip={tooltip}
      />
      <ChartLegend items={LEGEND} />
    </Card>
  )
}

export const RentVsOwnChart = memo(RentVsOwnChartImpl)
