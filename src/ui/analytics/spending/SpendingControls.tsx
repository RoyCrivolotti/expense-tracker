import type { SpendingGroupBy, SpendingSort } from '../../../engine'
import { SegmentedControl } from '../../components/SegmentedControl'
import { GroupByControl } from './GroupByControl'
import { MODE_OPTIONS, SORT_OPTIONS, type SpendingMode } from './spendingMode'
import styles from './spending.module.css'

interface Props {
  mode: SpendingMode
  onMode: (next: SpendingMode) => void
  groupBy: SpendingGroupBy
  onGroupBy: (next: SpendingGroupBy) => void
  hasLabels: boolean
  sortBy: SpendingSort
  onSort: (next: SpendingSort) => void
  onExport: () => void
}

/** The Spending view's controls: group-by and sort for the list, the CSV export for the grid. */
export function SpendingControls({
  mode,
  onMode,
  groupBy,
  onGroupBy,
  hasLabels,
  sortBy,
  onSort,
  onExport,
}: Props) {
  return (
    <div className={styles.controls}>
      {/* The grid is categories-only, so group-by and sort over it would lie. */}
      {mode === 'list' && <GroupByControl value={groupBy} onChange={onGroupBy} hasLabels={hasLabels} />}
      {mode === 'list' && (
        <SegmentedControl options={SORT_OPTIONS} value={sortBy} onChange={onSort} ariaLabel="Sort spending" />
      )}
      <span className={styles.controlsSpacer} />
      <SegmentedControl options={MODE_OPTIONS} value={mode} onChange={onMode} ariaLabel="Spending mode" />
      {mode === 'grid' && (
        <button type="button" className={styles.exportBtn} onClick={onExport}>
          Export CSV
        </button>
      )}
    </div>
  )
}
