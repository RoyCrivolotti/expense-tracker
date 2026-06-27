/**
 * Monthly totals — per budget month income, expenses, investments and net
 * saving, plus net expense per account.
 *
 * Rules (cash-basis model):
 * - Only `posted` transactions count; `forecast`/`cancelled` are excluded.
 * - Expenses are net of refunds (expense − refund), consistently per account
 *   and in aggregate (no gross/net split — that workbook quirk is gone).
 * - Net saving = income − expenses (investments are NOT subtracted).
 */
import type { Transaction } from '../types'

export interface MonthlyTotalsOptions {
  /** Include forecast card charges (dashboard committed-spend view). Default false. */
  includeForecast?: boolean
}

export interface MonthlyTotals {
  month: string
  incomeCents: number
  expensesCents: number
  investmentsCents: number
  netSavingCents: number
  /** Net expense (expense − refund) per account id. */
  netExpenseByAccount: Map<number, number>
  /** income − expenses − investments (cash leaving for the portfolio). */
  cashMovementCents: number
}

function emptyTotals(month: string): MonthlyTotals {
  return {
    month,
    incomeCents: 0,
    expensesCents: 0,
    investmentsCents: 0,
    netSavingCents: 0,
    netExpenseByAccount: new Map(),
    cashMovementCents: 0,
  }
}

function applyTxn(acc: MonthlyTotals, txn: Transaction): void {
  if (txn.type === 'income') {
    acc.incomeCents += txn.amountCents
    return
  }
  if (txn.type === 'investment') {
    acc.investmentsCents += txn.amountCents
    return
  }
  const signed = txn.type === 'refund' ? -txn.amountCents : txn.amountCents
  acc.expensesCents += signed
  acc.netExpenseByAccount.set(
    txn.accountId,
    (acc.netExpenseByAccount.get(txn.accountId) ?? 0) + signed,
  )
}

/** Compute totals for every budget month present in `transactions`. */
export function computeMonthlyTotals(
  transactions: Transaction[],
  opts: MonthlyTotalsOptions = {},
): Map<string, MonthlyTotals> {
  const byMonth = new Map<string, MonthlyTotals>()

  for (const txn of transactions) {
    if (txn.status === 'cancelled') continue
    if (!opts.includeForecast && txn.status === 'forecast') continue
    const acc = byMonth.get(txn.budgetMonth) ?? emptyTotals(txn.budgetMonth)
    applyTxn(acc, txn)
    byMonth.set(txn.budgetMonth, acc)
  }

  for (const acc of byMonth.values()) {
    acc.netSavingCents = acc.incomeCents - acc.expensesCents
    acc.cashMovementCents = acc.incomeCents - acc.expensesCents - acc.investmentsCents
  }
  return byMonth
}

/** Sum investments Jan through `throughMonth` within the same calendar year. */
export function investedYtdCents(
  totals: Map<string, MonthlyTotals>,
  throughMonth: string,
): number {
  const year = throughMonth.slice(0, 4)
  let sum = 0
  for (const [m, row] of totals) {
    if (m.startsWith(`${year}-`) && m <= throughMonth) sum += row.investmentsCents
  }
  return sum
}
