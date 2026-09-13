import { useMemo, useState } from 'react'
import type { Account, Category, Flag, TxnStatus, TxnType } from '../../types'
import styles from './tabs.module.css'
import { ActiveFilterChips } from './ActiveFilterChips'
import { buildActiveFilterChips } from './txnFilterChips'
import {
  CategoryAccountRow,
  DateScopeRow,
  FlagRow,
  SearchRow,
  StatusTypeRow,
} from './TxnFilterRows'

import type { TxnDateScope } from './txnDateScope'

export type StatusFilter = TxnStatus | 'all'

export interface TxnFiltersProps {
  categories: Category[]
  accounts: Account[]
  flags: Flag[]
  query: string
  status: StatusFilter
  categoryId: number | 'all'
  accountId: number | 'all'
  flagId: number | 'all' | 'none'
  txnType: TxnType | 'all'
  dateScope: TxnDateScope
  customDateFrom: string
  customDateTo: string
  selectMode: boolean
  canSelect: boolean
  secondaryFilterCount: number
  hasActiveFilters: boolean
  onClearFilters: () => void
  onQuery: (value: string) => void
  onCategory: (value: number | 'all') => void
  onAccount: (value: number | 'all') => void
  onFlag: (value: number | 'all' | 'none') => void
  onStatus: (value: StatusFilter) => void
  onTxnType: (value: TxnType | 'all') => void
  onDateScope: (value: TxnDateScope) => void
  onCustomDateFrom: (value: string) => void
  onCustomDateTo: (value: string) => void
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
      <div className={styles.filterToggleRow}>
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
        {props.hasActiveFilters && !props.selectMode ? (
          <button type="button" className={styles.filterClear} onClick={props.onClearFilters}>
            Clear filters
          </button>
        ) : null}
      </div>
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
          {props.flags.length > 0 ? (
            <FlagRow
              flags={props.flags}
              flagId={props.flagId}
              selectMode={props.selectMode}
              onFlag={props.onFlag}
            />
          ) : null}
          <StatusTypeRow
            status={props.status}
            txnType={props.txnType}
            selectMode={props.selectMode}
            onStatus={props.onStatus}
            onTxnType={props.onTxnType}
          />
          <DateScopeRow
            dateScope={props.dateScope}
            customDateFrom={props.customDateFrom}
            customDateTo={props.customDateTo}
            selectMode={props.selectMode}
            onDateScope={props.onDateScope}
            onCustomDateFrom={props.onCustomDateFrom}
            onCustomDateTo={props.onCustomDateTo}
          />
        </div>
      ) : null}
    </div>
  )
}
