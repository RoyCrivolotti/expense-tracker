import type { Account, Category, TxnType } from '../../types'
import { CloseIcon } from '../icons'
import type { StatusFilter } from './TxnFilters'
import type { TxnDateScope } from './txnDateScope'
import styles from './tabs.module.css'

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
      <label className={styles.dateScopeLabel} htmlFor="txn-date-scope">
        Date scope
      </label>
      <select
        id="txn-date-scope"
        className={dateScope !== 'budgetMonth' ? styles.activeSelect : undefined}
        value={dateScope}
        onChange={(e) => onDateScope(e.target.value as TxnDateScope)}
        disabled={selectMode}
      >
        <option value="budgetMonth">Budget month</option>
        <option value="last3Months">Last 3 months</option>
        <option value="allDates">All dates</option>
        <option value="custom">Custom range</option>
      </select>
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
