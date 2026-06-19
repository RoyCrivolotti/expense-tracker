import { useState } from 'react'
import type { ExpenseModel } from '../../useExpenseData'
import type { ExpenseActions } from '../../actions'
import { SegmentedControl } from '../../components/SegmentedControl'
import { InsightsCharts } from '../../charts/InsightsCharts'
import { MonthlySummaryMobile } from './MonthlySummaryMobile'
import { MonthlyTotalsMobile } from './MonthlyTotalsMobile'
import { CashReconMobile } from './CashReconMobile'
import { YearlyOverviewMobile } from './YearlyOverviewMobile'
import styles from './mobile.module.css'

type Section = 'summary' | 'totals' | 'cash' | 'year'

const SECTIONS: { value: Section; label: string }[] = [
  { value: 'summary', label: 'Summary' },
  { value: 'totals', label: 'Totals' },
  { value: 'cash', label: 'Cash' },
  { value: 'year', label: 'Year' },
]

export function AnalyticsTabMobile({
  model,
  month,
  onMonthChange,
  actions,
}: {
  model: ExpenseModel
  month: string
  onMonthChange: (month: string) => void
  actions?: ExpenseActions | undefined
}) {
  const [section, setSection] = useState<Section>('summary')

  return (
    <div className={styles.shell}>
      <div className={styles.tabBar}>
        <SegmentedControl
          options={SECTIONS}
          value={section}
          onChange={setSection}
          ariaLabel="Analytics section"
          layout="bar"
        />
      </div>
      {section === 'summary' && (
        <>
          <MonthlySummaryMobile model={model} month={month} onMonthChange={onMonthChange} />
          <InsightsCharts model={model} month={month} />
        </>
      )}
      {section === 'totals' && <MonthlyTotalsMobile model={model} />}
      {section === 'cash' && (
        <CashReconMobile
          model={model}
          {...(actions ? { onSetCashActual: actions.setCashActual } : {})}
        />
      )}
      {section === 'year' && <YearlyOverviewMobile model={model} />}
    </div>
  )
}
