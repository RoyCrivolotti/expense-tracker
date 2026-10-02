import { useMemo, useState, type ReactNode } from 'react'
import type { Account, Category, Flag, Label, TxnStatus, TxnType } from '../../types'
import styles from './tabs.module.css'
import { ActiveFilterChips } from './ActiveFilterChips'
import { buildActiveFilterChips } from './txnFilterChips'
import { Presence } from '../components/Presence'
import { EXIT_MS } from '../hooks/motion'
import { FilterToggle, SearchRow } from './TxnFilterRows'
import { RESULTS_ANCHOR_ID } from './scrollToResults'
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
  /** The item count and net spend, shown beside the Filters button in the sticky bar. */
  summary: ReactNode
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
    <>
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
      </div>
      {/*
        A direct child of the page stack rather than of .filters: a sticky element only
        holds while its parent is on screen, and .filters is two rows tall. The id is the
        scroll anchor the Flagged card drills in to (see scrollToResults).
      */}
      <div
        id={RESULTS_ANCHOR_ID}
        className={styles.resultBar}
        {...(props.hasActiveFilters ? { 'data-filtered': 'true' } : {})}
      >
        <FilterToggle
          expanded={expanded}
          onToggle={() => setExpanded((open) => !open)}
          secondaryFilterCount={props.secondaryFilterCount}
          selectMode={props.selectMode}
          onLockedPress={props.onLockedPress}
        />
        {props.summary}
      </div>
      <ActiveFilterChips
        chips={activeChips}
        locked={props.selectMode}
        onLockedPress={props.onLockedPress}
        onClear={props.hasActiveFilters && !props.selectMode ? props.onClearFilters : undefined}
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
    </>
  )
}
