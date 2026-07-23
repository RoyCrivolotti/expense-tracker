/**
 * Built-in defaults for scalar owner settings, applied when a user has no
 * settings row yet (fresh tenant) or has left preferences unset. Kept in one
 * place so the API, the in-memory test repo, and dev/demo data sources agree.
 */
import type { ExpenseSettings, GoalInputs } from '../types'
import { DEFAULT_BUDGET_ROLLOVER_DAY } from './dates'
import { DEFAULT_CURRENCY_CODE, DEFAULT_NUMBER_LOCALE } from './money'

export function defaultExpenseSettings(): ExpenseSettings {
  return {
    openingCashCents: 0,
    openingInvestmentCents: 0,
    liquidNetWorthCents: 0,
    defaultAccountId: null,
    currencyCode: DEFAULT_CURRENCY_CODE,
    numberLocale: DEFAULT_NUMBER_LOCALE,
    budgetRolloverDay: DEFAULT_BUDGET_ROLLOVER_DAY,
  }
}

export function defaultGoalInputs(): GoalInputs {
  return {
    housePriceCents: 0,
    downPaymentFraction: 0,
    mortgageTermYears: 0,
    mortgageRateAnnual: 0,
    longTermTargetCents: 0,
    horizonYears: 0,
    expectedRealReturn: 0,
  }
}
