/**
 * Where the month's income went: fixed costs, flexible spending, investing, and
 * what was left. One bar, four buckets, the Overview's part-to-whole picture.
 */
import type { Transaction } from '../types'
import { type AnalyticsBasis, basisOptions } from './analyticsPeriod'
import { type FixedSpendClassifier, splitFixedFlexible } from './fixedFlexible'

export interface Allocation {
  incomeCents: number
  fixedCents: number
  flexibleCents: number
  investedCents: number
  /** income − fixed − flexible − invested; negative means the month overspent. */
  leftoverCents: number
  overspent: boolean
}

export function computeAllocation(
  transactions: Transaction[],
  classifier: FixedSpendClassifier,
  month: string,
  basis: AnalyticsBasis,
): Allocation {
  const opts = basisOptions(basis)
  let incomeCents = 0
  let investedCents = 0
  for (const txn of transactions) {
    if (txn.budgetMonth !== month || txn.status === 'cancelled') continue
    if (!opts.includeForecast && txn.status === 'forecast') continue
    if (txn.type === 'income') incomeCents += txn.amountCents
    else if (txn.type === 'investment') investedCents += txn.amountCents
  }
  const { fixedCents, flexibleCents } = splitFixedFlexible(transactions, classifier, month, basis)
  const leftoverCents = incomeCents - fixedCents - flexibleCents - investedCents
  return {
    incomeCents,
    fixedCents,
    flexibleCents,
    investedCents,
    leftoverCents,
    overspent: leftoverCents < 0,
  }
}
