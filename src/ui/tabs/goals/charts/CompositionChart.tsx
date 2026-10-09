import { memo, useMemo, useState } from 'react'
import { useAssumedInflation } from '../../..//hooks/assumedInflationContext'
import type { NewGoalScenario } from '../../../../data/dataSource'
import { projectNetWorth, purchaseYearBreakdown, scenarioToParams } from '../../../../engine'
import { planMoneyLabel } from '../planMoneyLabel'
import { ChartShell } from './ChartShell'
import { LinearChart, type ChartSeries } from '../../../charts/LinearChart'
import { LiveLegend, type LiveLegendItem } from '../../../charts/LiveLegend'
import type { TooltipLine } from '../../../charts/ChartTooltip'
import { sparseLabels } from '../../../charts/linearScale'
import { formatMoneyShort } from '../chartTheme'
import { purchaseBreakdownTooltipLines } from '../purchaseTooltip'
import { useMoneyFormat } from '../../../hooks/moneyFormatContext'
import styles from '../goals.module.css'

const INVESTED_COLOR = 'var(--exp-investment)'
const HOUSE_COLOR = 'var(--exp-income)'
const MORTGAGE_COLOR = 'var(--exp-danger)'

// "House value", not equity: the series is what the house is worth, and the mortgage is its own
// series below it. Equity is the two together, which is what the net worth line takes.
const COMPOSITION_LEGEND_LABELS = [
  { label: 'Invested portfolio', color: INVESTED_COLOR },
  { label: 'House value', color: HOUSE_COLOR },
  { label: 'Mortgage owed', color: MORTGAGE_COLOR },
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
  const inflationRate = useAssumedInflation()
  const points = useMemo(
    () => projectNetWorth(scenarioToParams({ ...draft, id: 0 }, inflationRate)),
    [draft, inflationRate],
  )
  const format = useMoneyFormat()
  const years = points.map((p) => p.year)
  const labels = useMemo(() => sparseLabels(years, 5), [years])
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const activePoint = activeIndex != null ? points[activeIndex] : undefined
  const legendItems: LiveLegendItem[] = [
    { ...COMPOSITION_LEGEND_LABELS[0]!, valueCents: activePoint?.investedCents ?? null },
    { ...COMPOSITION_LEGEND_LABELS[1]!, valueCents: activePoint?.houseEquityCents ?? null },
    { ...COMPOSITION_LEGEND_LABELS[2]!, valueCents: activePoint?.mortgageBalanceCents ?? null },
  ]

  const series: ChartSeries[] = [
    {
      id: 'invested',
      color: INVESTED_COLOR,
      kind: 'area',
      values: points.map((p) => p.investedCents),
    },
    {
      id: 'house',
      color: HOUSE_COLOR,
      kind: 'area',
      values: points.map((p) => p.houseEquityCents),
    },
    {
      id: 'mortgage',
      color: MORTGAGE_COLOR,
      kind: 'area',
      values: points.map((p) => -p.mortgageBalanceCents),
    },
  ]

  const tooltip = (i: number): { title: string; lines: TooltipLine[] } => {
    const p = points[i]
    const year = years[i] ?? i
    const lines: TooltipLine[] = [
      { label: 'Invested portfolio', value: formatMoneyShort(p?.investedCents ?? 0, format), color: INVESTED_COLOR, tone: 'neutral' },
      { label: 'House value', value: formatMoneyShort(p?.houseEquityCents ?? 0, format), color: HOUSE_COLOR, tone: 'neutral' },
      { label: 'Mortgage owed', value: formatMoneyShort(p?.mortgageBalanceCents ?? 0, format), color: MORTGAGE_COLOR, tone: 'neutral' },
      {
        label: 'Net worth',
        value: formatMoneyShort(p?.netWorthCents ?? 0, format),
        tone: 'neutral',
      },
    ]
    const breakdown = purchaseYearBreakdown(scenarioToParams({ ...draft, id: 0 }, inflationRate), year)
    if (breakdown) lines.push(...purchaseBreakdownTooltipLines(breakdown, format))
    return { title: `Year ${year}`, lines }
  }

  return (
    <ChartShell embedded={embedded}>
      <h3 className={styles.chartTitle}>Net worth composition</h3>
      <p className={styles.chartHint}>
        Invested portfolio + house value − mortgage owed, for the scenario you are editing, in{' '}
        {planMoneyLabel(draft.planStartDate)}.
      </p>
      <LinearChart
        height={height}
        series={series}
        xLabels={labels}
        formatValue={(c) => formatMoneyShort(c, format)}
        ariaLabel="Net worth composition by year"
        tooltip={tooltip}
        onActiveIndexChange={setActiveIndex}
      />
      <LiveLegend items={legendItems} formatValue={(c) => formatMoneyShort(c, format)} />
    </ChartShell>
  )
}

export const CompositionChart = memo(CompositionChartImpl)
