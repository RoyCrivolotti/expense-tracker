import { useMemo, useState } from 'react'
import type { Account, Category, TxnStatus, TxnType } from '../../types'
import styles from './tabs.module.css'
import { ActiveFilterChips } from './ActiveFilterChips'
import { buildActiveFilterChips } from './txnFilterChips'
import {
  CategoryAccountRow,
  DateRangeRow,
  SearchRow,
  StatusTypeRow,
} from './TxnFilterRows'

export type StatusFilter = TxnStatus | 'all'

export interface TxnFiltersProps {
  categories: Category[]
  accounts: Account[]
  query: string
  status: StatusFilter
  categoryId: number | 'all'
  accountId: number | 'all'
  txnType: TxnType | 'all'
  useDateRange: boolean
  dateFrom: string
  dateTo: string
  selectMode: boolean
  canSelect: boolean
  secondaryFilterCount: number
  onQuery: (value: string) => void
  onCategory: (value: number | 'all') => void
  onAccount: (value: number | 'all') => void
  onStatus: (value: StatusFilter) => void
  onTxnType: (value: TxnType | 'all') => void
  onUseDateRange: (value: boolean) => void
  onDateFrom: (value: string) => void
  onDateTo: (value: string) => void
  onToggleSelectMode: () => void
}

export function TxnFilters(props: TxnFiltersProps) {
  const [expanded, setExpanded] = useState(false)
  const chevron = expanded ? '▾' : '▸'
  const activeChips = useMemo(() => buildActiveFilterChips(props), [props])

  return (
    <div className={styles.filters}>
      <SearchRow
        query={props.query}
        selectMode={props.selectMode}
        canSelect={props.canSelect}
        onQuery={props.onQuery}
        onToggleSelectMode={props.onToggleSelectMode}
      />
      <button
        type="button"
        className={`${styles.filterToggle}${
          props.secondaryFilterCount > 0 ? ` ${styles.filterToggleActive}` : ''
        }`}
        onClick={() => setExpanded((open) => !open)}
        disabled={props.selectMode}
        aria-expanded={expanded}
      >
        <span>{chevron} Filters</span>
        {props.secondaryFilterCount > 0 ? (
          <span className={styles.filterToggleBadge} aria-label={`${props.secondaryFilterCount} active filters`}>
            {props.secondaryFilterCount}
          </span>
        ) : null}
      </button>
      {!expanded ? <ActiveFilterChips chips={activeChips} /> : null}
      {expanded ? (
        <div className={styles.filterSecondary}>
          <CategoryAccountRow
            categories={props.categories}
            accounts={props.accounts}
            categoryId={props.categoryId}
            accountId={props.accountId}
            selectMode={props.selectMode}
            onCategory={props.onCategory}
            onAccount={props.onAccount}
          />
          <StatusTypeRow
            status={props.status}
            txnType={props.txnType}
            selectMode={props.selectMode}
            onStatus={props.onStatus}
            onTxnType={props.onTxnType}
          />
          <DateRangeRow
            useDateRange={props.useDateRange}
            dateFrom={props.dateFrom}
            dateTo={props.dateTo}
            selectMode={props.selectMode}
            onUseDateRange={props.onUseDateRange}
            onDateFrom={props.onDateFrom}
            onDateTo={props.onDateTo}
          />
        </div>
      ) : null}
    </div>
  )
}
