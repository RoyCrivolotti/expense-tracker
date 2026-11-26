import { useMemo } from 'react'
import { computeCashReconciliation } from '../../engine'
import type { ExpenseModel } from '../useExpenseData'
import { sumsOf } from '../modelSums'

/** The active deferred-settlement cards, the months newest first, and each card's charge in a month. */
export function useStatementCharges(model: ExpenseModel) {
  const deferred = useMemo(
    () => model.dataset.accounts.filter((a) => a.settlement === 'deferred' && a.active),
    [model.dataset],
  )
  const months = [...model.months].reverse()

  const sums = sumsOf(model)
  const reconciliation = useMemo(
    () => computeCashReconciliation(sums.transactions, sums.accounts, sums.settings, sums.cashActuals),
    [sums],
  )

  const chargeCents = (
    accountId: number,
    yearMonth: string,
  ): number => reconciliation.find((r) => r.month === yearMonth)?.cardCharges.get(accountId)?.chargeCents ?? 0
  return { deferred, months, reconciliation, chargeCents }
}
