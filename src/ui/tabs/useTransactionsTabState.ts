import { useMemo, useState } from 'react'
import type { ExpenseModel } from '../useExpenseData'
import type { ExpenseActions } from '../actions'
import { filterTransactions } from '../../engine'
import { useIsMobile } from '../hooks/useIsMobile'
import type { StatusFilter } from './TxnFilters'
import { useTransactionSelection } from './useTransactionSelection'

export function useTransactionsTabState(
  model: ExpenseModel,
  month: string,
  actions?: ExpenseActions,
) {
  const [categoryId, setCategoryId] = useState<number | 'all'>('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [query, setQuery] = useState('')
  const selection = useTransactionSelection(actions)
  const isMobile = useIsMobile()

  const results = useMemo(
    () =>
      filterTransactions(model.dataset.transactions, {
        month,
        status,
        ...(categoryId !== 'all' ? { categoryId } : {}),
        ...(query.trim() ? { query: query.trim() } : {}),
      }),
    [model.dataset, month, status, categoryId, query],
  )

  const totalCents = useMemo(
    () =>
      results.reduce(
        (sum, t) =>
          sum + (t.type === 'income' ? 0 : t.type === 'refund' ? -t.amountCents : t.amountCents),
        0,
      ),
    [results],
  )

  const canDelete = Boolean(actions?.deleteTransaction)

  return {
    categoryId,
    setCategoryId,
    status,
    setStatus,
    query,
    setQuery,
    isMobile,
    results,
    totalCents,
    canDelete,
    ...selection,
  }
}
