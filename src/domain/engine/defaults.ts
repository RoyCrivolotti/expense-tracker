/**
 * Built-in defaults for scalar owner settings, applied when a user has no
 * settings row yet (fresh tenant) or has left preferences unset. Kept in one
 * place so the API, the in-memory test repo, and dev/demo data sources agree.
 */
import type { ExpenseSettings } from '../types'
import { DEFAULT_BUDGET_ROLLOVER_DAY } from './dates'
import { defaultMilestones } from './milestones'
import { DEFAULT_INFLATION_RATE } from './projectionConstants'
import { DEFAULT_CURRENCY_CODE, DEFAULT_NUMBER_LOCALE } from './money'

export function defaultExpenseSettings(): ExpenseSettings {
  return {
    openingCashCents: 0,
    openingInvestmentCents: 0,
    defaultAccountId: null,
    investmentCategoryId: null,
    currencyCode: DEFAULT_CURRENCY_CODE,
    numberLocale: DEFAULT_NUMBER_LOCALE,
    budgetRolloverDay: DEFAULT_BUDGET_ROLLOVER_DAY,
    milestones: defaultMilestones(),
    claimantName: '',
    cashReserveMonths: 0,
    assumedInflation: DEFAULT_INFLATION_RATE,
  }
}
