import type { TxnFilter } from '../../engine'
import { calendarRangeLastMonths } from '../../engine'

export type TxnDateScope = 'budgetMonth' | 'last3Months' | 'allDates' | 'custom'

export const DEFAULT_LAST_MONTHS = 3

export function isSecondaryDateScope(scope: TxnDateScope): boolean {
  return scope !== 'budgetMonth'
}

export function defaultCustomDateRange(budgetMonth: string): { dateFrom: string; dateTo: string } {
  return calendarRangeLastMonths(budgetMonth, DEFAULT_LAST_MONTHS)
}

export function buildPeriodFilter(
  scope: TxnDateScope,
  budgetMonth: string,
  customDateFrom: string,
  customDateTo: string,
): Pick<TxnFilter, 'month' | 'dateFrom' | 'dateTo'> {
  if (scope === 'budgetMonth') return { month: budgetMonth }
  if (scope === 'last3Months') return calendarRangeLastMonths(budgetMonth, DEFAULT_LAST_MONTHS)
  if (scope === 'allDates') return {}
  return {
    ...(customDateFrom ? { dateFrom: customDateFrom } : {}),
    ...(customDateTo ? { dateTo: customDateTo } : {}),
  }
}

export function scopeChipLabel(
  scope: TxnDateScope,
  customDateFrom: string,
  customDateTo: string,
): string | null {
  if (scope === 'budgetMonth') return null
  if (scope === 'last3Months') return 'Dates: last 3 months'
  if (scope === 'allDates') return 'Dates: all'
  const from = customDateFrom || '…'
  const to = customDateTo || '…'
  return `Dates: ${from} – ${to}`
}
