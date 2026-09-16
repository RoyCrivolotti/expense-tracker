import { useMemo, useState } from 'react'
import type { Flag, TxnType } from '../../types'
import type { ExpenseModel } from '../useExpenseData'
import type { ExpenseActions } from '../actions'
import {
  buildTransactionListRows,
  computeCashReconciliation,
  filterTransactions,
  netSpendCents,
} from '../../engine'
import { useIsMobile } from '../hooks/useIsMobile'
import type { StatusFilter } from './TxnFilters'
import { useTransactionSelection } from './useTransactionSelection'
import {
  anchoredDateScope,
  buildPeriodFilter,
  defaultCustomDateRange,
  isSecondaryDateScope,
  type DateScopeChoice,
  type TxnDateScope,
} from './txnDateScope'

function useTxnListFilters(month: string, flags: Flag[], monthNavigation: number) {
  const [categoryId, setCategoryId] = useState<number | 'all'>('all')
  const [accountId, setAccountId] = useState<number | 'all'>('all')
  const [rawFlagId, setFlagId] = useState<number | 'all' | 'none'>('all')
  const [txnType, setTxnType] = useState<TxnType | 'all'>('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [query, setQuery] = useState('')
  const [scopeChoice, setScopeChoice] = useState<DateScopeChoice>(() => ({
    scope: 'budgetMonth',
    atNavigation: monthNavigation,
  }))
  const [customDateFrom, setCustomDateFrom] = useState('')
  const [customDateTo, setCustomDateTo] = useState('')

  /**
   * A flag can be deleted while its filter is still applied (from the Flagged
   * card's own Manage modal, or another tab). Resolving here rather than
   * storing means the list, the chip and the <select> all agree — a stored dead
   * id leaves the select showing "All flags" while the list renders nothing.
   */
  const flagId = useMemo(
    () =>
      typeof rawFlagId === 'number' && !flags.some((f) => f.id === rawFlagId) ? 'all' : rawFlagId,
    [rawFlagId, flags],
  )

  /**
   * Resolved rather than stored, for the same reason as `flagId`: moving the month after
   * choosing All or Custom would otherwise leave the header and the list disagreeing. The
   * custom range stays in state, so choosing Custom again brings it back.
   */
  const dateScope = anchoredDateScope(scopeChoice, monthNavigation)
  const setDateScope = (scope: TxnDateScope) => {
    setScopeChoice({ scope, atNavigation: monthNavigation })
  }

  const setDateScopeWithDefaults = (scope: TxnDateScope) => {
    if (scope === 'custom') {
      setCustomDateFrom((from) => from || defaultCustomDateRange(month).dateFrom)
      setCustomDateTo((to) => to || defaultCustomDateRange(month).dateTo)
    }
    setDateScope(scope)
  }

  const filter = useMemo(
    () => ({
      ...buildPeriodFilter(dateScope, month, customDateFrom, customDateTo),
      status,
      ...(categoryId !== 'all' ? { categoryId } : {}),
      ...(accountId !== 'all' ? { accountId } : {}),
      ...(flagId !== 'all' ? { flagId } : {}),
      ...(txnType !== 'all' ? { type: txnType } : {}),
      ...(query.trim() ? { query: query.trim() } : {}),
    }),
    [
      dateScope,
      customDateFrom,
      customDateTo,
      month,
      status,
      categoryId,
      accountId,
      flagId,
      txnType,
      query,
    ],
  )
  const hasActiveFilters = useMemo(
    () =>
      query.trim() !== '' ||
      categoryId !== 'all' ||
      accountId !== 'all' ||
      flagId !== 'all' ||
      txnType !== 'all' ||
      status !== 'all' ||
      isSecondaryDateScope(dateScope),
    [query, categoryId, accountId, flagId, txnType, status, dateScope],
  )
  const secondaryFilterCount = useMemo(
    () =>
      (categoryId !== 'all' ? 1 : 0) +
      (accountId !== 'all' ? 1 : 0) +
      (flagId !== 'all' ? 1 : 0) +
      (txnType !== 'all' ? 1 : 0) +
      (status !== 'all' ? 1 : 0) +
      (isSecondaryDateScope(dateScope) ? 1 : 0),
    [categoryId, accountId, flagId, txnType, status, dateScope],
  )
  const clearFilters = () => {
    setQuery('')
    setCategoryId('all')
    setAccountId('all')
    setFlagId('all')
    setTxnType('all')
    setStatus('all')
    setDateScope('budgetMonth')
    setCustomDateFrom('')
    setCustomDateTo('')
  }
  return {
    categoryId,
    setCategoryId,
    accountId,
    setAccountId,
    flagId,
    setFlagId,
    txnType,
    setTxnType,
    status,
    setStatus,
    query,
    setQuery,
    dateScope,
    setDateScope: setDateScopeWithDefaults,
    customDateFrom,
    setCustomDateFrom,
    customDateTo,
    setCustomDateTo,
    filter,
    hasActiveFilters,
    secondaryFilterCount,
    clearFilters,
  }
}

/** What the app shell tells the tab about things that happen outside it. */
export interface TransactionsShell {
  /** Told when row selection starts and ends, so the shell can hold the month still. */
  onSelectModeChange?: ((selecting: boolean) => void) | undefined
  /** How many times the user has moved the header month. */
  monthNavigation?: number | undefined
}

export function useTransactionsTabState(
  model: ExpenseModel,
  month: string,
  actions?: ExpenseActions,
  shell: TransactionsShell = {},
) {
  const filters = useTxnListFilters(month, model.dataset.flags, shell.monthNavigation ?? 0)
  const isMobile = useIsMobile()

  const results = useMemo(
    () => filterTransactions(model.dataset.transactions, filters.filter),
    [model.dataset, filters.filter],
  )

  const listRows = useMemo(() => {
    const cashRows = computeCashReconciliation(
      model.dataset.transactions,
      model.dataset.accounts,
      model.dataset.settings,
      model.dataset.cashActuals,
    )
    return buildTransactionListRows(
      model.dataset.transactions,
      filters.filter,
      model.dataset.accountStatements,
      cashRows,
      model.dataset.accounts,
      model.dataset.settings,
    )
  }, [model.dataset, filters.filter])

  const totalCents = useMemo(() => netSpendCents(results), [results])

  const visibleIds = useMemo(
    () => listRows.flatMap((r) => (r.kind === 'transaction' ? [r.txn.id] : [])),
    [listRows],
  )

  const existingIds = useMemo(
    () => model.dataset.transactions.map((t) => t.id),
    [model.dataset.transactions],
  )

  // This tab does not remount on a filter or month change, so the selection is told what
  // is on screen rather than rebuilt: it keeps rows a filter hides and acts only on the rest.
  const selection = useTransactionSelection(actions, visibleIds, existingIds, shell.onSelectModeChange)

  return {
    ...filters,
    isMobile,
    results,
    listRows,
    totalCents,
    visibleIds,
    canDelete: Boolean(actions?.deleteTransaction),
    ...selection,
  }
}
