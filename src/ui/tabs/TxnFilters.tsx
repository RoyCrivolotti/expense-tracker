import type { Category, TxnStatus } from '../../types'
import styles from './tabs.module.css'

type StatusFilter = TxnStatus | 'all'

interface TxnFiltersProps {
  categories: Category[]
  query: string
  status: StatusFilter
  categoryId: number | 'all'
  selectMode: boolean
  canSelect: boolean
  onQuery: (value: string) => void
  onCategory: (value: number | 'all') => void
  onStatus: (value: StatusFilter) => void
  onToggleSelectMode: () => void
}

export function TxnFilters({
  categories,
  query,
  status,
  categoryId,
  selectMode,
  canSelect,
  onQuery,
  onCategory,
  onStatus,
  onToggleSelectMode,
}: TxnFiltersProps) {
  return (
    <div className={styles.filters}>
      <div className={styles.filterTop}>
        <input
          className={styles.search}
          type="search"
          placeholder="Search description or notes…"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          disabled={selectMode}
        />
        {canSelect && (
          <button type="button" className={styles.selectBtn} onClick={onToggleSelectMode}>
            {selectMode ? 'Cancel' : 'Select'}
          </button>
        )}
      </div>
      <div className={styles.selectRow}>
        <select
          value={categoryId}
          onChange={(e) => onCategory(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          disabled={selectMode}
        >
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => onStatus(e.target.value as StatusFilter)}
          disabled={selectMode}
        >
          <option value="all">All statuses</option>
          <option value="posted">Posted</option>
          <option value="forecast">Forecast</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>
    </div>
  )
}

export type { StatusFilter }
