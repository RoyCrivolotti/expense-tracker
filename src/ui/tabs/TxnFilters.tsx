import { useMemo, useState } from 'react'
import type { Account, Category, Flag, Label, TxnStatus, TxnType } from '../../types'
import styles from './tabs.module.css'
import { ActiveFilterChips } from './ActiveFilterChips'
import { buildActiveFilterChips } from './txnFilterChips'
import { Presence } from '../components/Presence'
import { EXIT_MS } from '../hooks/motion'
import { FilterToggleRow, SearchRow } from './TxnFilterRows'
import { TxnFiltersSheet } from './TxnFiltersSheet'

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
      <ActiveFilterChips
        chips={activeChips}
        locked={props.selectMode}
        onLockedPress={props.onLockedPress}
      />
      <Presence show={expanded} exitMs={EXIT_MS.sheet}>
        <TxnFiltersSheet
          categories={props.categories}
          accounts={props.accounts}
          flags={props.flags}
          labels={props.labels}
          status={props.status}
          categoryId={props.categoryId}
          accountId={props.accountId}
          flagId={props.flagId}
          labelIds={props.labelIds}
          txnType={props.txnType}
          dateScope={props.dateScope}
          customDateFrom={props.customDateFrom}
          customDateTo={props.customDateTo}
          selectMode={props.selectMode}
          onClose={() => setExpanded(false)}
          onCategory={props.onCategory}
          onAccount={props.onAccount}
          onFlag={props.onFlag}
          onLabelIds={props.onLabelIds}
          onStatus={props.onStatus}
          onTxnType={props.onTxnType}
          onDateScope={props.onDateScope}
          onCustomDateFrom={props.onCustomDateFrom}
          onCustomDateTo={props.onCustomDateTo}
          onLockedPress={props.onLockedPress}
        />
      </Presence>
    </div>
  )
}
