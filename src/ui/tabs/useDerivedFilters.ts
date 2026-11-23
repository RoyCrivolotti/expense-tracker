import { useMemo } from 'react'
import type { TxnType } from '../../types'
import type { parseQueryAmount } from './txnAmountFilter'
import type { StatusFilter } from './TxnFilters'
import { buildPeriodFilter, isSecondaryDateScope, type TxnDateScope } from './txnDateScope'

export interface DerivedInput {
  categoryId: number | 'all'
  accountId: number | 'all'
  flagId: number | 'all' | 'none'
  labelIds: number[]
  txnType: TxnType | 'all'
  status: StatusFilter
  query: string
  dateScope: TxnDateScope
  month: string
  customDateFrom: string
  customDateTo: string
  amountMinCents: number | null
  amountMaxCents: number | null
}

/** The list filter the controls add up to. */
function buildListFilter(
  v: DerivedInput,
  queryAmount: ReturnType<typeof parseQueryAmount>,
) {
  const { dateScope, month, status, categoryId, accountId, flagId, labelIds, txnType, query } = v
  const { amountMinCents, amountMaxCents, customDateFrom, customDateTo } = v
  return {
    ...buildPeriodFilter(dateScope, month, customDateFrom, customDateTo),
    status,
    ...(categoryId !== 'all' ? { categoryId } : {}),
    ...(accountId !== 'all' ? { accountId } : {}),
    ...(flagId !== 'all' ? { flagId } : {}),
    ...(labelIds.length > 0 ? { labelIds } : {}),
    ...(txnType !== 'all' ? { type: txnType } : {}),
    ...(query.trim() ? { query: query.trim() } : {}),
    ...(queryAmount ? { queryAmount } : {}),
    ...(amountMinCents !== null ? { amountMinCents } : {}),
    ...(amountMaxCents !== null ? { amountMaxCents } : {}),
  }
}

/** Whether any control is away from its default, and how many of the secondary ones are. */
function useFilterSummaries(v: DerivedInput) {
  const { dateScope, status, categoryId, accountId, flagId, labelIds, txnType, query } = v
  const { amountMinCents, amountMaxCents } = v
  const amountActive = amountMinCents !== null || amountMaxCents !== null
  const hasActiveFilters = useMemo(
    () =>
      query.trim() !== '' ||
      categoryId !== 'all' ||
      accountId !== 'all' ||
      flagId !== 'all' ||
      labelIds.length > 0 ||
      txnType !== 'all' ||
      status !== 'all' ||
      amountActive ||
      isSecondaryDateScope(dateScope),
    [query, categoryId, accountId, flagId, labelIds, txnType, status, amountActive, dateScope],
  )
  const secondaryFilterCount = useMemo(
    () =>
      (categoryId !== 'all' ? 1 : 0) +
      (accountId !== 'all' ? 1 : 0) +
      (flagId !== 'all' ? 1 : 0) +
      (labelIds.length > 0 ? 1 : 0) +
      (txnType !== 'all' ? 1 : 0) +
      (status !== 'all' ? 1 : 0) +
      (amountActive ? 1 : 0) +
      (isSecondaryDateScope(dateScope) ? 1 : 0),
    [categoryId, accountId, flagId, labelIds, txnType, status, amountActive, dateScope],
  )
  return { hasActiveFilters, secondaryFilterCount }
}

/** The list filter and the two summaries of how many controls are away from their defaults. */
export function useDerivedFilters(
  v: DerivedInput,
  queryAmount: ReturnType<typeof parseQueryAmount>,
) {
  const { dateScope, month, status, categoryId, accountId, flagId, labelIds, txnType, query } = v
  const { amountMinCents, amountMaxCents, customDateFrom, customDateTo } = v
  const filter = useMemo(
    () =>
      buildListFilter(
        {
          dateScope,
          month,
          status,
          categoryId,
          accountId,
          flagId,
          labelIds,
          txnType,
          query,
          amountMinCents,
          amountMaxCents,
          customDateFrom,
          customDateTo,
        },
        queryAmount,
      ),
    [
      dateScope,
      customDateFrom,
      customDateTo,
      month,
      status,
      categoryId,
      accountId,
      flagId,
      labelIds,
      txnType,
      query,
      queryAmount,
      amountMinCents,
      amountMaxCents,
    ],
  )
  const { hasActiveFilters, secondaryFilterCount } = useFilterSummaries(v)
  return { filter, hasActiveFilters, secondaryFilterCount }
}
