import { useMemo, useState } from 'react'
import type { AnalyticsBasis, SpendingGroupBy, SpendingSort } from '../../../engine'
import { sortSpendingRows } from '../../../engine'
import type { ExpenseModel } from '../../useExpenseData'
import type { SpendingMode } from './spendingMode'
import { spendingRows } from './spendingModel'

/** Which grouping, view, sort and row are chosen, and the rows they give for the month. */
export function useSpendingSelection(
  model: ExpenseModel,
  month: string,
  basis: AnalyticsBasis,
  today: string,
  openMonth: string,
) {
  const [groupBy, setGroupBy] = useState<SpendingGroupBy>('category')
  const [mode, setMode] = useState<SpendingMode>('list')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  // A row open for one month would reappear on another month that happens to have it, so a
  // month change closes the detail (render-phase, pre-paint, as CashView does).
  const [selectedFor, setSelectedFor] = useState(month)
  if (selectedFor !== month) {
    setSelectedFor(month)
    setSelectedKey(null)
  }

  const rows = useMemo(
    () => spendingRows(model, { month, basis, today, openMonth, groupBy }),
    [model, month, basis, today, openMonth, groupBy],
  )
  const [sortBy, setSortBy] = useState<SpendingSort>('amount')
  const ordered = useMemo(() => sortSpendingRows(rows, sortBy), [rows, sortBy])
  const selected = rows.find((r) => r.key === selectedKey) ?? null
  const changeGroupBy = (next: SpendingGroupBy) => {
    setGroupBy(next)
    setSelectedKey(null)
  }

  return {
    groupBy,
    mode,
    setMode,
    sortBy,
    setSortBy,
    selectedKey,
    setSelectedKey,
    rows,
    ordered,
    selected,
    changeGroupBy,
  }
}
