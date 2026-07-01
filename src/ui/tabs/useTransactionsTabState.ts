import { useMemo, useState } from 'react'
import type { TxnType } from '../../types'
import type { ExpenseModel } from '../useExpenseData'
import type { ExpenseActions } from '../actions'
import { filterTransactions, netSpendCents } from '../../engine'
import { useIsMobile } from '../hooks/useIsMobile'
import type { StatusFilter } from './TxnFilters'
import { useTransactionSelection } from './useTransactionSelection'
import {
  buildPeriodFilter,
  defaultCustomDateRange,
  isSecondaryDateScope,
  type TxnDateScope,
} from './txnDateScope'

function useTxnListFilters(month: string) {
  const [categoryId, setCategoryId] = useState<number | 'all'>('all')
  const [accountId, setAccountId] = useState<number | 'all'>('all')
  const [txnType, setTxnType] = useState<TxnType | 'all'>('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [query, setQuery] = useState('')
  const [dateScope, setDateScope] = useState<TxnDateScope>('budgetMonth')
  const [customDateFrom, setCustomDateFrom] = useState('')
  const [customDateTo, setCustomDateTo] = useState('')

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
      ...(txnType !== 'all' ? { type: txnType } : {}),
      ...(query.trim() ? { query: query.trim() } : {}),
    }),
    [dateScope, customDateFrom, customDateTo, month, status, categoryId, accountId, txnType, query],
  )
  const hasActiveFilters = useMemo(
    () =>
      query.trim() !== '' ||
      categoryId !== 'all' ||
      accountId !== 'all' ||
      txnType !== 'all' ||
      status !== 'all' ||
      isSecondaryDateScope(dateScope),
    [query, categoryId, accountId, txnType, status, dateScope],
  )
  const secondaryFilterCount = useMemo(
    () =>
      (categoryId !== 'all' ? 1 : 0) +
      (accountId !== 'all' ? 1 : 0) +
      (txnType !== 'all' ? 1 : 0) +
      (status !== 'all' ? 1 : 0) +
      (isSecondaryDateScope(dateScope) ? 1 : 0),
    [categoryId, accountId, txnType, status, dateScope],
  )
  const clearFilters = () => {
    setQuery('')
    setCategoryId('all')
    setAccountId('all')
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

export function useTransactionsTabState(
  model: ExpenseModel,
  month: string,
  actions?: ExpenseActions,
) {
  const filters = useTxnListFilters(month)
  const selection = useTransactionSelection(actions)
  const isMobile = useIsMobile()

  const results = useMemo(
    () => filterTransactions(model.dataset.transactions, filters.filter),
    [model.dataset, filters.filter],
  )

  const totalCents = useMemo(() => netSpendCents(results), [results])

  return {
    ...filters,
    isMobile,
    results,
    totalCents,
    canDelete: Boolean(actions?.deleteTransaction),
    ...selection,
  }
}
