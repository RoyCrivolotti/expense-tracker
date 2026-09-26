import { memo, useMemo } from 'react'
import type { NewGoalScenario } from '../../../../data/dataSource'
import { monthsSincePlanStart, type MonthlyFlow } from '../../../../engine'
import { ChartShell } from './ChartShell'
import { LinearChart, type ChartSeries } from '../../../charts/LinearChart'
import { ChartLegend, type LegendItem } from '../../../charts/ChartLegend'
import type { TooltipLine } from '../../../charts/ChartTooltip'
import { sparseLabels } from '../../../charts/linearScale'
import { formatMoneyShort } from '../chartTheme'
import { useMoneyFormat } from '../../../hooks/moneyFormatContext'
import styles from '../goals.module.css'

const INVESTED_COLOR = 'var(--exp-investment)'
const SAVING_COLOR = 'color-mix(in srgb, var(--exp-income) 55%, transparent)'
const PLAN_COLOR = 'color-mix(in srgb, var(--color-text) 45%, transparent)'

const LEGEND: LegendItem[] = [
  { label: 'Invested', color: INVESTED_COLOR },
  { label: 'Net saving', color: SAVING_COLOR },
  { label: 'Plan assumption', color: PLAN_COLOR },
]

/** Long enough to see a habit, short enough that the labels stay readable. */
const MAX_MONTHS = 24

function monthLabel(month: string): string {
  const [year, mm] = month.split('-')
  return mm && year ? `${mm}/${year.slice(2)}` : month
}

/**
 * Whether the monthly pace the plan assumes is being kept. The plan's figure is money
 * going into the portfolio, so it is compared with investment transactions; net saving
 * is drawn fainter beside it, because the gap between the two is money that stayed in
 * the current account.
 */
function SavingsRateChartImpl({
  draft,
  monthly,
  height = 210,
  embedded = false,
}: {
  draft: NewGoalScenario
  monthly: MonthlyFlow[]
  height?: number
  embedded?: boolean
}) {
  const format = useMoneyFormat()
  const recent = useMemo(
    () => monthsSincePlanStart(monthly, draft.planStartDate).slice(-MAX_MONTHS),
    [monthly, draft.planStartDate],
  )
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
        <h3 className={styles.chartTitle}>Actual investing vs plan</h3>
        <p className={styles.chartHint}>No monthly history yet to compare against your plan.</p>
      </ChartShell>
    )
  }

  const series: ChartSeries[] = [
    { id: 'saving', color: SAVING_COLOR, values: recent.map((m) => m.netSavingCents), dashed: true },
    { id: 'invested', color: INVESTED_COLOR, values: recent.map((m) => m.investedCents) },
  ]
  const tooltip = (i: number): { title: string; lines: TooltipLine[] } => ({
    title: recent[i]?.month ?? '',
    lines: [
      { label: 'Invested', value: formatMoneyShort(recent[i]?.investedCents ?? 0, format), color: INVESTED_COLOR, tone: 'neutral' },
      { label: 'Net saving', value: formatMoneyShort(recent[i]?.netSavingCents ?? 0, format), color: SAVING_COLOR, tone: 'neutral' },
      { label: 'Plan', value: formatMoneyShort(draft.monthlyContributionCents, format), color: PLAN_COLOR, tone: 'neutral' },
    ],
  })
  const since = draft.planStartDate ? ' since the plan started' : ''

  return (
    <ChartShell embedded={embedded}>
      <h3 className={styles.chartTitle}>Actual investing vs plan</h3>
      <p className={styles.chartHint}>
        Investment transactions per month{since} vs the{' '}
        {formatMoneyShort(draft.monthlyContributionCents, format)}/mo this scenario assumes. The
        fainter line is net saving, what was left after expenses; the gap is money that stayed in
        the current account.
      </p>
      <LinearChart
        height={height}
        series={series}
        xLabels={labels}
        refLines={[draft.monthlyContributionCents]}
        formatValue={(c) => formatMoneyShort(c, format)}
        ariaLabel="Monthly investing versus planned contribution"
        tooltip={tooltip}
      />
      <ChartLegend items={LEGEND} />
    </ChartShell>
  )
}

export const SavingsRateChart = memo(SavingsRateChartImpl)
