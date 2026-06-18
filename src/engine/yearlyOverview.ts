/**
 * Yearly overview — reproduces the running-balance sheet: per-month income,
 * actual/forecast expenses, investments, net saving, and the cumulative
 * expected-cash / investment-balance / net-worth trajectory.
 */
import type { ExpenseSettings, Transaction } from '../types'
import { sortedMonths } from './dates'

export interface MonthOverview {
  month: string
  incomeCents: number
  actualExpensesCents: number
  forecastExpensesCents: number
  investmentsCents: number
  netSavingCents: number
  cashMovementCents: number
  expectedCashCents: number
  investmentBalanceCents: number
  netWorthCents: number
}

interface MonthAgg {
  income: number
  actual: number
  forecast: number
  investments: number
}

function aggregate(transactions: Transaction[]): Map<string, MonthAgg> {
  const byMonth = new Map<string, MonthAgg>()
  for (const txn of transactions) {
    if (txn.status === 'cancelled') continue
    const agg = byMonth.get(txn.budgetMonth) ?? {
      income: 0,
      actual: 0,
      forecast: 0,
      investments: 0,
    }
    const signed = txn.type === 'refund' ? -txn.amountCents : txn.amountCents
    if (txn.status === 'forecast') {
      if (txn.type === 'expense' || txn.type === 'refund') agg.forecast += signed
    } else if (txn.type === 'income') agg.income += txn.amountCents
    else if (txn.type === 'investment') agg.investments += txn.amountCents
    else agg.actual += signed
    byMonth.set(txn.budgetMonth, agg)
  }
  return byMonth
}

/** Per-month overview rows in ascending month order, with cumulative balances. */
export function computeYearlyOverview(
  transactions: Transaction[],
  settings: ExpenseSettings,
): MonthOverview[] {
  const byMonth = aggregate(transactions)
  const months = sortedMonths(byMonth.keys())

  let cash = settings.openingCashCents
  let investmentBalance = settings.openingInvestmentCents
  const rows: MonthOverview[] = []

  for (const month of months) {
    const agg = byMonth.get(month)!
    const cashMovement = agg.income - agg.actual - agg.investments
    cash += cashMovement
    investmentBalance += agg.investments
    rows.push({
      month,
      incomeCents: agg.income,
      actualExpensesCents: agg.actual,
      forecastExpensesCents: agg.forecast,
      investmentsCents: agg.investments,
      netSavingCents: agg.income - agg.actual,
      cashMovementCents: cashMovement,
      expectedCashCents: cash,
      investmentBalanceCents: investmentBalance,
      netWorthCents: cash + investmentBalance,
    })
  }
  return rows
}
