import type { AnalyticsBasis, AnalyticsPeriod, CompareMode } from '../../engine'
import { SegmentedControl } from '../components/SegmentedControl'
import type { AnalyticsFilters } from './useAnalyticsFilters'
import styles from './analyticsShell.module.css'

const BASIS_OPTIONS: { value: AnalyticsBasis; label: string }[] = [
  { value: 'committed', label: 'Committed' },
  { value: 'paid', label: 'Paid only' },
]

const PERIOD_OPTIONS: { value: AnalyticsPeriod; label: string }[] = [
  { value: 'month', label: 'Month' },
  { value: 'ytd', label: 'Year to date' },
  { value: 'last12', label: '12 months' },
]

const COMPARE_OPTIONS: { value: CompareMode; label: string }[] = [
  { value: 'prevMonth', label: 'Last month' },
  { value: 'avg3', label: '3-mo avg' },
  { value: 'prevYear', label: 'Last year' },
]

const BASIS_HINT: Record<AnalyticsBasis, string> = {
  committed: 'Unpaid card charges count in their budget month, matching budgets and the Dashboard.',
  paid: 'Only paid charges count, matching cash.',
}

/**
 * Period, comparison and basis for Overview; Spending shows only the basis, and
 * Cash — paid-basis by nature — shows none of it.
 */
export function AnalyticsFilterRow({
  filters,
  withPeriod = false,
}: {
  filters: AnalyticsFilters
  withPeriod?: boolean
}) {
  return (
    <div className={styles.filterRow}>
      {withPeriod && (
        <SegmentedControl
          options={PERIOD_OPTIONS}
          value={filters.period}
          onChange={filters.setPeriod}
          ariaLabel="Period"
        />
      )}
      {withPeriod && (
        <SegmentedControl
          options={COMPARE_OPTIONS}
          value={filters.compare}
          onChange={filters.setCompare}
          ariaLabel="Compare against"
          disabled={filters.period !== 'month'}
        />
      )}
      <SegmentedControl
        options={BASIS_OPTIONS}
        value={filters.basis}
        onChange={filters.setBasis}
        ariaLabel="Spending basis"
      />
      <p className={styles.basisHint}>{BASIS_HINT[filters.basis]}</p>
    </div>
  )
}
