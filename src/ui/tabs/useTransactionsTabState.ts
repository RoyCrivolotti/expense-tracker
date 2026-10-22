import { useMemo, useState } from 'react'
import type { Flag, Label, TxnType } from '../../types'
import type { TransactionsEntry } from './transactionsEntry'
import type { ExpenseModel } from '../useExpenseData'
import { sumsOf } from '../modelSums'
import type { ExpenseActions } from '../actions'
import {
  buildTransactionListRows,
  computeCashReconciliation,
  filterTransactions,
  netSpendCents,
  type TxnFilter,
} from '../../engine'
import { useIsMobile } from '../hooks/useIsMobile'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import type { ListView } from '../transactionListView'
import { parseAmountBound, parseQueryAmount } from './txnAmountFilter'
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

function useTxnListFilters(
  month: string,
  flags: Flag[],
  labels: Label[],
  monthNavigation: number,
  entry?: TransactionsEntry | null,
) {
  const [categoryId, setCategoryId] = useState<number | 'all'>('all')
  const [accountId, setAccountId] = useState<number | 'all'>('all')
  const [rawFlagId, setFlagId] = useState<number | 'all' | 'none'>('all')
  const [rawLabelIds, setLabelIds] = useState<number[]>([])
  const [txnType, setTxnType] = useState<TxnType | 'all'>('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [query, setQuery] = useState('')
  const [amountMin, setAmountMin] = useState('')
  const [amountMax, setAmountMax] = useState('')
  const moneyFormat = useMoneyFormat()
  const [scopeChoice, setScopeChoice] = useState<DateScopeChoice>(() => ({
    scope: 'budgetMonth',
    atNavigation: monthNavigation,
  }))
  const [customDateFrom, setCustomDateFrom] = useState('')
  const [customDateTo, setCustomDateTo] = useState('')

  // An entry preset replaces the secondary filters wholesale, once per arrival
  // (each navigation hands over a fresh object; the render-phase guard is React's
  // documented way to adjust state when a prop changes). The list is the user's
  // again after that.
  const [appliedEntry, setAppliedEntry] = useState<TransactionsEntry | null>(null)
  if (entry && entry !== appliedEntry) {
    setAppliedEntry(entry)
    setCategoryId(entry.categoryId ?? 'all')
    setAccountId('all')
    setFlagId('all')
    setLabelIds(entry.labelIds ?? [])
    setTxnType(entry.type ?? 'all')
    setStatus(entry.status ?? 'all')
    setQuery(entry.query ?? '')
    setAmountMin('')
    setAmountMax('')
    // The month itself was navigated by the shell; keep the scope on it.
    setScopeChoice((prev) => ({ scope: 'budgetMonth', atNavigation: prev.atNavigation }))
  }

  /**
   * A flag can be deleted while its filter is still applied (from the Flagged
   * card's own Manage modal, or another tab). Resolving here rather than
   * storing means the list, the chip and the <select> all agree — a stored dead
   * id leaves the select showing "Flag" while the list renders nothing.
   */
  const flagId = useMemo(
    () =>
      typeof rawFlagId === 'number' && !flags.some((f) => f.id === rawFlagId) ? 'all' : rawFlagId,
    [rawFlagId, flags],
  )

  /**
   * Same self-healing as `flagId`, adapted for an array: a selected label can be
   * deleted while its filter is still applied, so stale ids are dropped every
   * render rather than stored, keeping the list, the chip and the picker in
   * agreement.
   */
  const labelIds = useMemo(
    () => rawLabelIds.filter((id) => labels.some((l) => l.id === id)),
    [rawLabelIds, labels],
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

  const amountMinCents = parseAmountBound(amountMin, moneyFormat)
  const amountMaxCents = parseAmountBound(amountMax, moneyFormat)
  const queryAmount = useMemo(() => parseQueryAmount(query.trim(), moneyFormat), [query, moneyFormat])

  const filter = useMemo(
    () => ({
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
      labelIds,
      txnType,
      query,
      queryAmount,
      amountMinCents,
      amountMaxCents,
    ],
  )
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
  const clearFilters = () => {
    setQuery('')
    setCategoryId('all')
    setAccountId('all')
    setFlagId('all')
    setLabelIds([])
    setTxnType('all')
    setStatus('all')
    setAmountMin('')
    setAmountMax('')
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
    labelIds,
    setLabelIds,
    txnType,
    setTxnType,
    status,
    setStatus,
    query,
    setQuery,
    amountMin,
    setAmountMin,
    amountMax,
    setAmountMax,
    amountMinCents,
    amountMaxCents,
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

/** The list when the model holds every row it can show: filtered here, in one go. */
export function listOfHeldRows(model: ExpenseModel, sums: ExpenseModel['dataset'], filter: TxnFilter): ListView {
  const { dataset } = model
  const results = filterTransactions(dataset.transactions, filter)
  const cashRows = computeCashReconciliation(sums.transactions, dataset.accounts, dataset.settings, dataset.cashActuals)
  const listRows = buildTransactionListRows(
    dataset.transactions,
    filter,
    dataset.accountStatements,
    cashRows,
    dataset.accounts,
    dataset.settings,
  )
  return { results, listRows, totalCents: netSpendCents(results), count: listRows.length }
}

function useHeldList(model: ExpenseModel, filter: TxnFilter): ListView {
  const sums = sumsOf(model)
  return useMemo(() => listOfHeldRows(model, sums, filter), [model.dataset, sums, filter]) // eslint-disable-line react-hooks/exhaustive-deps -- the model's dataset and sums are the inputs
}

/** What the app shell tells the tab about things that happen outside it. */
export interface TransactionsShell {
  /** Told when row selection starts and ends, so the shell can hold the month still. */
  onSelectModeChange?: ((selecting: boolean) => void) | undefined
  /** How many times the user has moved the header month. */
  monthNavigation?: number | undefined
  /** A filter preset another tab handed over on the way in (see transactionsEntry). */
  entry?: TransactionsEntry | null | undefined
}

export function useTransactionsTabState(
  model: ExpenseModel,
  month: string,
  actions?: ExpenseActions,
  shell: TransactionsShell = {},
) {
  const filters = useTxnListFilters(
    month,
    model.dataset.flags,
    model.dataset.labels,
    shell.monthNavigation ?? 0,
    shell.entry,
  )
  const isMobile = useIsMobile()

  // A model whose list is read in pages brings its own hook; its presence does not change while it lives.
  const useList = model.pagedList?.useList ?? useHeldList
  const list = useList(model, filters.filter)

  const visibleIds = useMemo(
    () => list.listRows.flatMap((r) => (r.kind === 'transaction' ? [r.txn.id] : [])),
    [list.listRows],
  )

  // Only a model that holds every row can say a row is gone: one that holds a window has not read the rest.
  const existingIds = useMemo(
    () => (model.sums === undefined ? model.dataset.transactions.map((t) => t.id) : undefined),
    [model.dataset.transactions, model.sums],
  )
  const filterKey = JSON.stringify(filters.filter)
  const paged = useMemo(
    () => (model.pagedList ? { matching: list.matching ?? null, filterKey } : undefined),
    [model.pagedList, list.matching, filterKey],
  )

  // This tab does not remount on a filter or month change, so the selection is told what
  // is on screen rather than rebuilt: it keeps rows a filter hides and acts only on the rest.
  const selection = useTransactionSelection(
    actions,
    visibleIds,
    existingIds,
    shell.onSelectModeChange,
    model.dataset.transactions,
    paged,
  )

  return {
    ...filters,
    isMobile,
    ...list,
    visibleIds,
    canDelete: Boolean(actions?.deleteTransaction),
    ...selection,
  }
}
