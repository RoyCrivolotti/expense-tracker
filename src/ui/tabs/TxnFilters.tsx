import { useMemo, useState } from 'react'
import type { Account, Category, TxnStatus, TxnType } from '../../types'
import styles from './tabs.module.css'
import { ActiveFilterChips } from './ActiveFilterChips'
import { buildActiveFilterChips } from './txnFilterChips'
import {
  CategoryAccountRow,
  DateScopeRow,
  SearchRow,
  StatusTypeRow,
} from './TxnFilterRows'

import type { TxnDateScope } from './txnDateScope'

export type StatusFilter = TxnStatus | 'all'

export interface TxnFiltersProps {
  categories: Category[]
  accounts: Account[]
  query: string
  status: StatusFilter
  categoryId: number | 'all'
  accountId: number | 'all'
  txnType: TxnType | 'all'
  dateScope: TxnDateScope
  customDateFrom: string
  customDateTo: string
  selectMode: boolean
  canSelect: boolean
  secondaryFilterCount: number
  onQuery: (value: string) => void
  onCategory: (value: number | 'all') => void
  onAccount: (value: number | 'all') => void
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
