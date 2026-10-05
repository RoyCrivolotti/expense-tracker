import { useMemo, useState } from 'react'
import type { AnalyticsBasis, AnalyticsPeriod, CompareMode } from '../../../engine'
import type { ExpenseModel } from '../../useExpenseData'
import { Card } from '../../components/primitives'
import { MonthlyTotalsTable } from '../MonthlyTotalsTable'
import type { AnalyticsView } from '../analyticsView'
import { buildOverviewData } from './overviewModel'
import { buildTrendModel } from './trendChartModel'
import { KpiTiles } from './KpiTiles'
import { TrendChart } from './TrendChart'
import { PaceCard } from './PaceCard'
import { SignalsCard } from './SignalsCard'
import { AllocationBar } from './AllocationBar'
import { MoversCard } from './MoversCard'
import { BaselineCard } from './BaselineCard'
import { FixedCostsCard } from './FixedCostsCard'
import styles from './overview.module.css'

const BASELINE_NAME: Record<CompareMode, string> = {
  prevMonth: 'last month',
  avg3: '3-month average',
  prevYear: 'last year',
}

const WINDOW_BASELINE_NAME: Record<Exclude<AnalyticsPeriod, 'month'>, string> = {
  ytd: 'last year',
  last12: 'the year before',
}

interface Props {
  model: ExpenseModel
  month: string
  basis: AnalyticsBasis
  period: AnalyticsPeriod
  compare: CompareMode
  today: string
  /** The budget month `today` falls in (rollover-aware). */
  openMonth: string
  onSelectMonth: (month: string) => void
  onShowView: (view: AnalyticsView) => void
  onUseBaselineInGoals?: ((monthlyCents: number) => void) | undefined
}

/** How am I doing? KPIs, trend, pace, signals, allocation, movers, baseline. */
export function OverviewView({
  model,
  month,
  basis,
  period,
  compare,
  today,
  openMonth,
  onSelectMonth,
  onShowView,
  onUseBaselineInGoals,
}: Props) {
  const data = useMemo(
    () => buildOverviewData(model, { month, period, compare, basis, today, openMonth }),
    [model, month, period, compare, basis, today, openMonth],
  )
  const trend = useMemo(
    () => buildTrendModel(data.kpis.series, data.unpaidByMonth),
    [data.kpis.series, data.unpaidByMonth],
  )
  const [showTable, setShowTable] = useState(false)
  const baselineName = period === 'month' ? BASELINE_NAME[compare] : WINDOW_BASELINE_NAME[period]
  const sameDays = data.kpis.openDayLimit

  return (
    <div className={styles.stack}>
      {sameDays !== null && (
        <p className={styles.sameDaysNote}>
          {period === 'month'
            ? `Open month, compared with the first ${sameDays} days of ${baselineName}.`
            : `The open month counts its first ${sameDays} days, to match ${baselineName}.`}
        </p>
      )}
      <KpiTiles kpis={data.kpis} baselineName={baselineName} />
      <SignalsCard signals={data.signals} onShowView={onShowView} />
      <div className={styles.grid2}>
        <Card>
          <div className={styles.cardHead}>
            <h3 className={styles.cardTitle}>Trend</h3>
            <button type="button" className={styles.tableToggle} onClick={() => setShowTable((v) => !v)}>
              {showTable ? 'Hide table' : 'Table'}
            </button>
          </div>
          <TrendChart model={trend} selectedMonth={month} onSelectMonth={onSelectMonth} />
        </Card>
        <PaceCard pace={data.pace} isFuture={month > openMonth} />
      </div>
      {showTable && (
        <Card>
          <h3 className={styles.cardTitle}>Monthly totals</h3>
          <MonthlyTotalsTable model={model} basis={basis} />
        </Card>
      )}
      <div className={styles.grid2}>
        <AllocationBar allocation={data.allocation} throughDay={data.kpis.openDayLimit} />
        <MoversCard movers={data.movers} />
      </div>
      <FixedCostsCard items={data.fixedCosts} />
      {data.baseline && <BaselineCard baseline={data.baseline} onUseInGoals={onUseBaselineInGoals} />}
    </div>
  )
}
