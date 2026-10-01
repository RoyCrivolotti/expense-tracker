import { useMemo, useState } from 'react'
import type { Account, Category, Flag, Label, TxnStatus, TxnType } from '../../types'
import styles from './tabs.module.css'
import { ActiveFilterChips } from './ActiveFilterChips'
import { buildActiveFilterChips } from './txnFilterChips'
import {
  DateScopeRow,
  FilterToggleRow,
  LockShield,
  PrimaryFilterRow,
  SearchRow,
  SecondaryFilterRow,
} from './TxnFilterRows'

import type { TxnDateScope } from './txnDateScope'

export type StatusFilter = TxnStatus | 'all'

export interface TxnFiltersProps {
  categories: Category[]
  accounts: Account[]
  flags: Flag[]
  labels: Label[]
  query: string
  status: StatusFilter
  categoryId: number | 'all'
  accountId: number | 'all'
  flagId: number | 'all' | 'none'
  labelIds: number[]
  txnType: TxnType | 'all'
  dateScope: TxnDateScope
  customDateFrom: string
  customDateTo: string
  selectMode: boolean
  /** A bulk action is running; see SearchRow. */
  selectBusy?: boolean
  canSelect: boolean
  secondaryFilterCount: number
  hasActiveFilters: boolean
  onClearFilters: () => void
  onQuery: (value: string) => void
  onCategory: (value: number | 'all') => void
  onAccount: (value: number | 'all') => void
  onFlag: (value: number | 'all' | 'none') => void
  onLabelIds: (ids: number[]) => void
  onStatus: (value: StatusFilter) => void
  onTxnType: (value: TxnType | 'all') => void
  onDateScope: (value: TxnDateScope) => void
  onCustomDateFrom: (value: string) => void
  onCustomDateTo: (value: string) => void
  onToggleSelectMode: () => void
  /** Pressing anything locked by the selection: say why nothing happens. */
  onLockedPress?: (() => void) | undefined
}

export function TxnFilters(props: TxnFiltersProps) {
  const [expanded, setExpanded] = useState(false)
  const activeChips = useMemo(() => buildActiveFilterChips(props), [props])

  return (
    <div className={styles.filters}>
      <SearchRow
        query={props.query}
        selectMode={props.selectMode}
        selectBusy={props.selectBusy ?? false}
        canSelect={props.canSelect}
        onQuery={props.onQuery}
        onToggleSelectMode={props.onToggleSelectMode}
        onLockedPress={props.onLockedPress}
      />
      <FilterToggleRow
        expanded={expanded}
        onToggle={() => setExpanded((open) => !open)}
        secondaryFilterCount={props.secondaryFilterCount}
        hasActiveFilters={props.hasActiveFilters}
        selectMode={props.selectMode}
        onClearFilters={props.onClearFilters}
        onLockedPress={props.onLockedPress}
      />
      {!expanded ? (
        <ActiveFilterChips
          chips={activeChips}
          locked={props.selectMode}
          onLockedPress={props.onLockedPress}
        />
      ) : null}
      {expanded ? (
        <div className={styles.filterSecondary}>
          <PrimaryFilterRow
            categories={props.categories}
            accounts={props.accounts}
            categoryId={props.categoryId}
            accountId={props.accountId}
            txnType={props.txnType}
            selectMode={props.selectMode}
            onCategory={props.onCategory}
            onAccount={props.onAccount}
            onTxnType={props.onTxnType}
          />
          <SecondaryFilterRow
            flags={props.flags}
            flagId={props.flagId}
            onFlag={props.onFlag}
            status={props.status}
            onStatus={props.onStatus}
            labels={props.labels}
            labelIds={props.labelIds}
            onLabelIds={props.onLabelIds}
            selectMode={props.selectMode}
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
          {props.selectMode ? (
            <LockShield label="Filters are locked while rows are selected" onPress={props.onLockedPress} />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
