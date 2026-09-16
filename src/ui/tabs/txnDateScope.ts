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

/** A date scope as the user chose it, and how many month moves had happened by then. */
export interface DateScopeChoice {
  scope: TxnDateScope
  atNavigation: number
}

/**
 * The scope the list should use, given how many times the user has moved the month.
 *
 * All and Custom ignore the header month, so once the user moves it after choosing one of
 * them, the header and the list disagree: the header on March, the list still on April to
 * June. A month move means "show me this month", so from then on the list shows it. Month
 * and the last three months follow the header already and are left as chosen.
 */
export function anchoredDateScope(choice: DateScopeChoice, navigation: number): TxnDateScope {
  if (navigation === choice.atNavigation) return choice.scope
  return choice.scope === 'allDates' || choice.scope === 'custom' ? 'budgetMonth' : choice.scope
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
