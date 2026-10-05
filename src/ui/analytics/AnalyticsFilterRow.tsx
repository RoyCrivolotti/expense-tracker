import type { AnalyticsBasis } from '../../engine'
import { SegmentedControl } from '../components/SegmentedControl'
import styles from './analyticsShell.module.css'

const BASIS_OPTIONS: { value: AnalyticsBasis; label: string }[] = [
  { value: 'committed', label: 'Committed' },
  { value: 'paid', label: 'Paid only' },
]

const BASIS_HINT: Record<AnalyticsBasis, string> = {
  committed: 'Unpaid card charges count in their budget month, matching budgets and the Dashboard.',
  paid: 'Only paid charges count, matching cash.',
}

/** The basis toggle shown on Overview and Spending; Cash is paid-basis by nature. */
export function AnalyticsFilterRow({
  basis,
  onBasisChange,
}: {
  basis: AnalyticsBasis
  onBasisChange: (next: AnalyticsBasis) => void
}) {
  return (
    <div className={styles.filterRow}>
      <SegmentedControl
        options={BASIS_OPTIONS}
        value={basis}
        onChange={onBasisChange}
        ariaLabel="Spending basis"
      />
      <p className={styles.basisHint}>{BASIS_HINT[basis]}</p>
    </div>
  )
}
