import { useMemo, useState } from 'react'
import type { Flag, Label, TxnType } from '../../types'
import type { TransactionsEntry } from './transactionsEntry'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import { parseAmountBound, parseQueryAmount } from './txnAmountFilter'
import { useDerivedFilters } from './useDerivedFilters'
import type { StatusFilter } from './TxnFilters'
import { anchoredDateScope, defaultCustomDateRange, type DateScopeChoice, type TxnDateScope } from './txnDateScope'

/** Category, account, flag and labels. `apply` sets them from an entry preset, or back to none. */
function useChoiceFilters() {
  const [categoryId, setCategoryId] = useState<number | 'all'>('all')
  const [accountId, setAccountId] = useState<number | 'all'>('all')
  const [rawFlagId, setFlagId] = useState<number | 'all' | 'none'>('all')
  const [rawLabelIds, setLabelIds] = useState<number[]>([])
  const apply = (entry?: TransactionsEntry) => {
    setCategoryId(entry?.categoryId ?? 'all')
    setAccountId('all')
    setFlagId('all')
    setLabelIds(entry?.labelIds ?? [])
  }
  const pub = { categoryId, setCategoryId, accountId, setAccountId, setFlagId, setLabelIds }
  return { pub, rawFlagId, rawLabelIds, apply }
}

/** Type, status, the search text and the two amount boxes. `apply` is as for the choices. */
function useTextFilters() {
  const [txnType, setTxnType] = useState<TxnType | 'all'>('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [query, setQuery] = useState('')
  const [amountMin, setAmountMin] = useState('')
  const [amountMax, setAmountMax] = useState('')
  const moneyFormat = useMoneyFormat()
  const apply = (entry?: TransactionsEntry) => {
    setTxnType(entry?.type ?? 'all')
    setStatus(entry?.status ?? 'all')
    setQuery(entry?.query ?? '')
    setAmountMin('')
    setAmountMax('')
  }
  const pub = {
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
  }
  return { pub, moneyFormat, apply }
}

/** The date scope and the custom range. */
function useDateFilters(monthNavigation: number) {
  const [scopeChoice, setScopeChoice] = useState<DateScopeChoice>(() => ({
    scope: 'budgetMonth',
    atNavigation: monthNavigation,
  }))
  const [customDateFrom, setCustomDateFrom] = useState('')
  const [customDateTo, setCustomDateTo] = useState('')
  const setDateScope = (scope: TxnDateScope) => {
    setScopeChoice({ scope, atNavigation: monthNavigation })
  }
  // The month itself was navigated by the shell; keep the scope on it.
  const onEntry = () => setScopeChoice((prev) => ({ scope: 'budgetMonth', atNavigation: prev.atNavigation }))
  const clear = () => {
    setDateScope('budgetMonth')
    setCustomDateFrom('')
    setCustomDateTo('')
  }
  const pub = { customDateFrom, setCustomDateFrom, customDateTo, setCustomDateTo }
  return { pub, scopeChoice, setDateScope, onEntry, clear }
}

/** The raw filter state, plus the arrival of an entry preset and clearing the lot. */
function useFilterFields(
  monthNavigation: number,
  entry?: TransactionsEntry | null,
) {
  const choice = useChoiceFilters()
  const text = useTextFilters()
  const dates = useDateFilters(monthNavigation)

  // An entry preset replaces the secondary filters wholesale, once per arrival
  // (each navigation hands over a fresh object; the render-phase guard is React's
  // documented way to adjust state when a prop changes). The list is the user's
  // again after that.
  const [appliedEntry, setAppliedEntry] = useState<TransactionsEntry | null>(null)
  if (entry && entry !== appliedEntry) {
    setAppliedEntry(entry)
    choice.apply(entry)
    text.apply(entry)
    dates.onEntry()
  }

  const clearFilters = () => {
    text.apply()
    choice.apply()
    dates.clear()
  }
  return { choice, text, dates, clearFilters }
}

export function useTxnListFilters(
  month: string,
  flags: Flag[],
  labels: Label[],
  monthNavigation: number,
  entry?: TransactionsEntry | null,
) {
  const { choice, text, dates, clearFilters } = useFilterFields(monthNavigation, entry)
  const { query, amountMin, amountMax } = text.pub
  const { setCustomDateFrom, setCustomDateTo } = dates.pub

  /**
   * A flag can be deleted while its filter is still applied (from the Flagged
   * card's own Manage modal, or another tab). Resolving here rather than
   * storing means the list, the chip and the <select> all agree — a stored dead
   * id leaves the select showing "Flag" while the list renders nothing.
   */
  const flagId = useMemo(
    () =>
      typeof choice.rawFlagId === 'number' && !flags.some((f) => f.id === choice.rawFlagId) ? 'all' : choice.rawFlagId,
    [choice.rawFlagId, flags],
  )

  /**
   * Same self-healing as `flagId`, adapted for an array: a selected label can be
   * deleted while its filter is still applied, so stale ids are dropped every
   * render rather than stored, keeping the list, the chip and the picker in
   * agreement.
   */
  const labelIds = useMemo(
    () => choice.rawLabelIds.filter((id) => labels.some((l) => l.id === id)),
    [choice.rawLabelIds, labels],
  )

  /**
   * Resolved rather than stored, for the same reason as `flagId`: moving the month after
   * choosing All or Custom would otherwise leave the header and the list disagreeing. The
   * custom range stays in state, so choosing Custom again brings it back.
   */
  const dateScope = anchoredDateScope(dates.scopeChoice, monthNavigation)

  const setDateScopeWithDefaults = (scope: TxnDateScope) => {
    if (scope === 'custom') {
      setCustomDateFrom((from) => from || defaultCustomDateRange(month).dateFrom)
      setCustomDateTo((to) => to || defaultCustomDateRange(month).dateTo)
    }
    dates.setDateScope(scope)
  }

  const amountMinCents = parseAmountBound(amountMin, text.moneyFormat)
  const amountMaxCents = parseAmountBound(amountMax, text.moneyFormat)
  const queryAmount = useMemo(() => parseQueryAmount(query.trim(), text.moneyFormat), [query, text.moneyFormat])
  const derived = useDerivedFilters(
    { ...choice.pub, ...text.pub, ...dates.pub, flagId, labelIds, dateScope, month, amountMinCents, amountMaxCents },
    queryAmount,
  )
  return {
    ...choice.pub,
    ...text.pub,
    ...dates.pub,
    ...derived,
    flagId,
    labelIds,
    amountMinCents,
    amountMaxCents,
    dateScope,
    setDateScope: setDateScopeWithDefaults,
    clearFilters,
  }
}
