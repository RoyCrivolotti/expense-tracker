import { useMemo, useState } from 'react'
import type { TxnType } from '../../types'
import type { ExpenseModel } from '../useExpenseData'
import type { ExpenseActions } from '../actions'
import { filterTransactions, netSpendCents } from '../../engine'
import { useIsMobile } from '../hooks/useIsMobile'
import type { StatusFilter } from './TxnFilters'
import { useTransactionSelection } from './useTransactionSelection'

function useTxnListFilters(month: string) {
  const [categoryId, setCategoryId] = useState<number | 'all'>('all')
  const [accountId, setAccountId] = useState<number | 'all'>('all')
  const [txnType, setTxnType] = useState<TxnType | 'all'>('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [query, setQuery] = useState('')
  const [useDateRange, setUseDateRange] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const filter = useMemo(
    () => ({
      ...(useDateRange
        ? { ...(dateFrom ? { dateFrom } : {}), ...(dateTo ? { dateTo } : {}) }
        : { month }),
      status,
      ...(categoryId !== 'all' ? { categoryId } : {}),
      ...(accountId !== 'all' ? { accountId } : {}),
      ...(txnType !== 'all' ? { type: txnType } : {}),
      ...(query.trim() ? { query: query.trim() } : {}),
    }),
    [useDateRange, dateFrom, dateTo, month, status, categoryId, accountId, txnType, query],
  )
  const hasActiveFilters = useMemo(
    () =>
      query.trim() !== '' ||
      categoryId !== 'all' ||
      accountId !== 'all' ||
      txnType !== 'all' ||
      status !== 'all' ||
      useDateRange,
    [query, categoryId, accountId, txnType, status, useDateRange],
  )
  const secondaryFilterCount = useMemo(
    () =>
      (categoryId !== 'all' ? 1 : 0) +
      (accountId !== 'all' ? 1 : 0) +
      (txnType !== 'all' ? 1 : 0) +
      (status !== 'all' ? 1 : 0) +
      (useDateRange ? 1 : 0),
    [categoryId, accountId, txnType, status, useDateRange],
  )
  const clearFilters = () => {
    setQuery('')
    setCategoryId('all')
    setAccountId('all')
    setTxnType('all')
    setStatus('all')
    setUseDateRange(false)
    setDateFrom('')
    setDateTo('')
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
    useDateRange,
    setUseDateRange,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
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
