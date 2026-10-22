import type { ExpenseDataset } from '../../src/domain/types'
import { syntheticLedger } from '../../src/testing/syntheticLedger'

/** The budget month the synthetic ledger ends in. A plan due after it would make a read insert rows. */
export function currentBudgetMonth(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7)
}

function ledger(months: number, perMonth: number, endMonth: string): ExpenseDataset {
  return syntheticLedger({ months, perMonth, endMonth, seed: 7 })
}

/**
 * A synthetic ledger of about `transactions` rows, never fewer than 90% of them. The generator's rows per
 * month are `fixed + perMonth`, so two probes give the line and the answer is read off it.
 */
export function ledgerOfAbout(transactions: number, endMonth: string = currentBudgetMonth()): ExpenseDataset {
  const months = Math.min(120, Math.max(6, Math.round(transactions / 40)))
  const one = ledger(months, 1, endMonth).transactions.length
  const two = ledger(months, 2, endMonth).transactions.length
  const slope = Math.max(1, two - one)
  const perMonth = Math.max(1, Math.ceil((transactions - one) / slope) + 1)
  return ledger(months, perMonth, endMonth)
}
