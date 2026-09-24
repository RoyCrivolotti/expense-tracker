/**
 * The emergency fund, as months of spending: the cash accounts in a check-in against the
 * average of recent monthly expenses. Invested-only tracking stays untouched; this is the
 * one number a cash balance is good for.
 */
import type { Transaction, WealthAccount, WealthCheckin } from '../types'
import { computeMonthlyTotals } from './monthlyTotals'

/** How many recent budget months the spending average looks back over. */
export const CASH_RESERVE_SPEND_MONTHS = 12

export interface CashReserve {
  cashCents: number
  /** Average monthly expenses over the recent months, or null with no spending recorded. */
  monthlySpendCents: number | null
  /** Months the cash would cover at that spend, or null when the spend is unknown. */
  monthsCovered: number | null
  targetMonths: number
}

/** Sum of the check-in's balances in cash-kind accounts. */
export function checkinCashCents(checkin: WealthCheckin, accounts: WealthAccount[]): number {
  const cashIds = new Set(accounts.filter((a) => a.kind === 'cash').map((a) => a.id))
  return checkin.entries.filter((e) => cashIds.has(e.accountId)).reduce((s, e) => s + e.valueCents, 0)
}

/**
 * Mean expenses over the last months that recorded any, or null with none. A month with
 * only income or investing logged says nothing about spending, so it does not count as a
 * month of zero and pull the average down.
 */
export function averageMonthlySpendCents(transactions: Transaction[]): number | null {
  const months = [...computeMonthlyTotals(transactions).values()]
    .filter((m) => m.expensesCents !== 0)
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-CASH_RESERVE_SPEND_MONTHS)
  if (months.length === 0) return null
  const total = months.reduce((s, m) => s + m.expensesCents, 0)
  return Math.round(total / months.length)
}

/** Null when the check-in records no cash account, since there is nothing to measure. */
export function cashReserve(
  checkin: WealthCheckin,
  accounts: WealthAccount[],
  transactions: Transaction[],
  targetMonths: number,
): CashReserve | null {
  if (!accounts.some((a) => a.kind === 'cash')) return null
  const cashCents = checkinCashCents(checkin, accounts)
  const monthlySpendCents = averageMonthlySpendCents(transactions)
  const monthsCovered =
    monthlySpendCents !== null && monthlySpendCents > 0 ? cashCents / monthlySpendCents : null
  return { cashCents, monthlySpendCents, monthsCovered, targetMonths }
}
