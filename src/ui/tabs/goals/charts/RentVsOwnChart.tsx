import { memo, useMemo } from 'react'
import { useAssumedInflation } from '../../..//hooks/assumedInflationContext'
import type { NewGoalScenario } from '../../../../data/dataSource'
import { formatCentsCompact, projectRentVsBuy, realHouseGrowth, scenarioToParams } from '../../../../engine'
import { planMoneyLabel } from '../planMoneyLabel'
import { rentVsBuyCaption } from './rentVsBuyCaption'
import { rentVsBuyHeadline } from './rentVsBuyHeadline'
import { rentVsBuyMarkers } from './rentVsBuyMarkers'
import { rentVsBuyTooltip } from './rentVsBuyTooltip'
import { ChartShell } from './ChartShell'
import { LinearChart, type ChartSeries } from '../../../charts/LinearChart'
import { ChartLegend } from '../../../charts/ChartLegend'
import { sparseLabels } from '../../../charts/linearScale'
import { formatMoneyShort } from '../chartTheme'
import { useMoneyFormat } from '../../../hooks/moneyFormatContext'
import styles from '../goals.module.css'

const RENT_COLOR = 'var(--exp-warning)'
const BUY_COLOR = 'var(--exp-investment)'

function RentVsOwnChartImpl({
  draft,
  height = 210,
  embedded = false,
}: {
  draft: NewGoalScenario
  height?: number
  embedded?: boolean
}) {
  const inflationRate = useAssumedInflation()
  const result = useMemo(
    () =>
      projectRentVsBuy({
        params: scenarioToParams({ ...draft, id: 0 }, inflationRate),
        rentMonthlyCents: draft.rentMonthlyCents,
        carryRate: draft.homeCarryRate,
      }),
    [draft, inflationRate],
  )
  const { points, verdict } = result
  const format = useMoneyFormat()
  const years = points.map((p) => p.year)
  // The years count from the purchase, not the plan start, so the axis says so with a unit.
  const labels = useMemo(() => sparseLabels(years, 5).map((l) => (l === '' ? l : `${l}y`)), [years])
  const markers = useMemo(() => rentVsBuyMarkers(result, points.length - 1), [result, points.length])

  if (points.length === 0) {
    return (
      <ChartShell embedded={embedded}>
        <h3 className={styles.chartTitle}>Rent vs buy</h3>
        <p className={styles.chartHint}>Set a house price to compare renting against buying.</p>
      </ChartShell>
    )
  }

  const series: ChartSeries[] = [
    { id: 'rent', color: RENT_COLOR, values: points.map((p) => p.rentNetWorthCents) },
    { id: 'buy', color: BUY_COLOR, values: points.map((p) => p.buyNetWorthCents) },
  ]
  const short = (c: number) => formatMoneyShort(c, format)
  const first = points[0]!

  return (
    <ChartShell embedded={embedded}>
      <h3 className={styles.chartTitle}>Rent vs buy (net worth)</h3>
      <p className={styles.chartHint}>{rentVsBuyHeadline(verdict, points[points.length - 1], short)}</p>
      <LinearChart
        height={height}
        series={series}
        xLabels={labels}
        formatValue={short}
        ariaLabel="Net worth from renting versus buying, by year after buying"
        tooltip={(i) => rentVsBuyTooltip(points, i, { format, rentColor: RENT_COLOR, buyColor: BUY_COLOR })}
        labeledMarkers={markers}
      />
      <ChartLegend
        items={[
          { label: `Renter: money invested (starts at ${short(first.rentNetWorthCents)})`, color: RENT_COLOR },
          { label: `Buyer: house less loan, plus savings (starts at ${short(first.buyNetWorthCents)})`, color: BUY_COLOR },
        ]}
      />
      <p className={`${styles.chartHint} ${styles.chartCaption}`}>
        {rentVsBuyCaption({
          upfrontCents: result.upfrontCents,
          feesCents: draft.transactionCostsCents,
          priceCents: result.priceCents,
          startYear: result.startYear,
          moneyLabel: planMoneyLabel(draft.planStartDate, format),
          carryRate: draft.homeCarryRate,
          realReturn: draft.expectedRealReturn,
          houseGrowth: realHouseGrowth(draft.houseAppreciationRate, inflationRate) - 1,
          paymentCents: result.paymentOnAccountCents,
          ownCheaper: result.ownCheaper,
          loanPaidOffYear: result.loanPaidOffYear,
          money: (c) => formatCentsCompact(c, format),
          format,
        })}
      </p>
    </ChartShell>
  )
}

export const RentVsOwnChart = memo(RentVsOwnChartImpl)
