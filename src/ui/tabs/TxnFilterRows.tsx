import type { Account, Category, TxnType } from '../../types'
import { CloseIcon } from '../icons'
import { SegmentedControl } from '../components/SegmentedControl'
import type { StatusFilter } from './TxnFilters'
import type { TxnDateScope } from './txnDateScope'
import styles from './tabs.module.css'

const DATE_SCOPE_OPTIONS: { value: TxnDateScope; label: string }[] = [
  { value: 'budgetMonth', label: 'Month' },
  { value: 'last3Months', label: '3 months' },
  { value: 'allDates', label: 'All' },
  { value: 'custom', label: 'Custom' },
]

export function SearchRow({
  query,
  selectMode,
  canSelect,
  onQuery,
  onToggleSelectMode,
}: {
  query: string
  selectMode: boolean
  canSelect: boolean
  onQuery: (value: string) => void
  onToggleSelectMode: () => void
}) {
  return (
    <div className={styles.filterTop}>
      <div className={styles.searchWrap}>
        <input
          className={styles.search}
          type="text"
          inputMode="search"
          placeholder="Search description or notes…"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          disabled={selectMode}
        />
        {query && !selectMode && (
          <button
            type="button"
            className={styles.searchClear}
            onClick={() => onQuery('')}
            aria-label="Clear search"
          >
            <CloseIcon />
          </button>
        )}
      </div>
      {canSelect && (
        <button type="button" className={styles.selectBtn} onClick={onToggleSelectMode}>
          {selectMode ? 'Cancel' : 'Select'}
        </button>
      )}
    </div>
  )
}

export function CategoryAccountRow({
  categories,
  accounts,
  categoryId,
  accountId,
  selectMode,
  onCategory,
  onAccount,
}: {
  categories: Category[]
  accounts: Account[]
  categoryId: number | 'all'
  accountId: number | 'all'
  selectMode: boolean
  onCategory: (value: number | 'all') => void
  onAccount: (value: number | 'all') => void
}) {
  return (
    <div className={styles.selectRow}>
      <select
        className={categoryId !== 'all' ? styles.activeSelect : undefined}
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
        className={accountId !== 'all' ? styles.activeSelect : undefined}
        value={accountId}
        onChange={(e) => onAccount(e.target.value === 'all' ? 'all' : Number(e.target.value))}
        disabled={selectMode}
      >
        <option value="all">All accounts</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </div>
  )
}

export function StatusTypeRow({
  status,
  txnType,
  selectMode,
  onStatus,
  onTxnType,
}: {
  status: StatusFilter
  txnType: TxnType | 'all'
  selectMode: boolean
  onStatus: (value: StatusFilter) => void
  onTxnType: (value: TxnType | 'all') => void
}) {
  return (
    <div className={styles.selectRow}>
      <select
        className={status !== 'all' ? styles.activeSelect : undefined}
        value={status}
        onChange={(e) => onStatus(e.target.value as StatusFilter)}
        disabled={selectMode}
      >
        <option value="all">All statuses</option>
        <option value="posted">Posted</option>
        <option value="forecast">Forecast</option>
        <option value="cancelled">Cancelled</option>
      </select>
      <select
        className={txnType !== 'all' ? styles.activeSelect : undefined}
        value={txnType}
        onChange={(e) => onTxnType(e.target.value as TxnType | 'all')}
        disabled={selectMode}
      >
        <option value="all">All types</option>
        <option value="expense">Expense</option>
        <option value="income">Income</option>
        <option value="investment">Investment</option>
        <option value="refund">Refund</option>
      </select>
    </div>
  )
}

export function DateScopeRow({
  dateScope,
  customDateFrom,
  customDateTo,
  selectMode,
  onDateScope,
  onCustomDateFrom,
  onCustomDateTo,
}: {
  dateScope: TxnDateScope
  customDateFrom: string
  customDateTo: string
  selectMode: boolean
  onDateScope: (value: TxnDateScope) => void
  onCustomDateFrom: (value: string) => void
  onCustomDateTo: (value: string) => void
}) {
  return (
    <div className={styles.dateScopeBlock}>
      <span className={styles.dateScopeLabel} id="txn-date-scope-label">
        Date scope
      </span>
      <SegmentedControl
        options={DATE_SCOPE_OPTIONS}
        value={dateScope}
        onChange={onDateScope}
        ariaLabel="Date scope"
        layout="bar"
        disabled={selectMode}
      />
      {dateScope === 'custom' ? (
        <div className={styles.selectRow}>
          <input
            type="date"
            value={customDateFrom}
            onChange={(e) => onCustomDateFrom(e.target.value)}
            disabled={selectMode}
            aria-label="From date"
          />
          <input
            type="date"
            value={customDateTo}
            onChange={(e) => onCustomDateTo(e.target.value)}
            disabled={selectMode}
            aria-label="To date"
          />
        </div>
      ) : null}
    </div>
  )
}
