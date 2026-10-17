/**
 * A 60 month ledger built to break a bounded read: the synthetic ledger (fixed, quarterly and yearly
 * series, plan instalments, flagged rows settled by a refund, negative investments, paid and unpaid
 * card months) with a rollover day other than 1, months where every row is cancelled, a four month gap,
 * a month whose only row is for nothing, a row flagged years ago and never settled, and a yearly series
 * whose newest charge is cancelled. Placeholder data only.
 */
import type { ExpenseDataset, StoredTransaction, Transaction } from '../domain/types'
import { defaultBudgetMonth, shiftBudgetMonth } from '../domain/engine/dates'
import { deriveTransactions } from '../domain/engine/status'
import { syntheticLedger } from './syntheticLedger'
import { CAT, CHECKING } from './syntheticReference'

export const ADVERSARIAL_ROLLOVER_DAY = 25
const END_MONTH = '2026-08'
const COUNT = 60

/** The 60 calendar months the ledger spans, oldest first. */
export const adversarialMonths = (): string[] =>
  Array.from({ length: COUNT }, (_, i) => shiftBudgetMonth(END_MONTH, i - (COUNT - 1)))

const byApiOrder = (a: Transaction, b: Transaction) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1)

export function adversarialLedger(): ExpenseDataset {
  const base = syntheticLedger({ months: COUNT, perMonth: 20, endMonth: END_MONTH, seed: 7 })
  const months = adversarialMonths()
  const cancelledOnly = new Set([months[8], months[9], months[40]])
  const gap = new Set(months.slice(20, 27))
  const zeroOnly = months[24]!
  const stored: StoredTransaction[] = base.transactions
    .filter((t) => !gap.has(t.budgetMonth))
    .map(({ status: _status, labelIds: _labels, ...row }) => {
      const budgetMonth =
        row.planId == null ? defaultBudgetMonth(row.date, ADVERSARIAL_ROLLOVER_DAY) : row.budgetMonth
      const stops = row.description === 'Car insurance' && budgetMonth > '2025-04'
      return { ...row, budgetMonth, cancelled: row.cancelled || stops || cancelledOnly.has(budgetMonth) }
    })
  const labels = new Map(base.transactions.map((t) => [t.id, t.labelIds ?? []]))
  const extra: StoredTransaction[] = [
    // Flagged years ago and never settled.
    { id: 9_001, date: `${months[2]}-11`, budgetMonth: months[2]!, description: 'Old claim', accountId: CHECKING, categoryId: CAT.travel, type: 'expense', amountCents: 5_000, cancelled: false, flagId: 1 },
    // The only row in its month, and it is for nothing.
    { id: 9_002, date: `${zeroOnly}-10`, budgetMonth: zeroOnly, description: 'Free sample', accountId: CHECKING, categoryId: CAT.other, type: 'expense', amountCents: 0, cancelled: false },
  ]
  const transactions = deriveTransactions([...stored, ...extra], base.accounts, base.accountStatements)
    .map((t) => ({ ...t, labelIds: labels.get(t.id) ?? [] }))
    .sort(byApiOrder)
  return {
    ...base,
    transactions,
    settings: { ...base.settings, budgetRolloverDay: ADVERSARIAL_ROLLOVER_DAY },
    cashActuals: base.cashActuals.filter((c) => !gap.has(c.yearMonth)),
  }
}
