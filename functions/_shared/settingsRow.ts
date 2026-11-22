import type { ExpenseSettings } from '../domain/types'
import { DEFAULT_BUDGET_ROLLOVER_DAY } from '../domain/engine/dates'
import { parseLevers } from '../domain/engine/goalLevers'
import { DEFAULT_MARKET_VOLATILITY } from '../domain/engine/marketVolatility'
import { parseMilestones } from '../domain/engine/milestones'
import { DEFAULT_CURRENCY_CODE, DEFAULT_NUMBER_LOCALE } from '../domain/engine/money'
import { DEFAULT_INFLATION_RATE } from '../domain/engine/projectionConstants'
import { tipsSeenField } from '../domain/onboarding/tips'

export interface SettingsRow {
  opening_cash_cents: number
  opening_investment_cents: number
  default_account_id: number | null
  investment_category_id: number | null
  currency_code: string | null
  number_locale: string | null
  budget_rollover_day: number | null
  milestones: string | null
  claimant_name: string | null
  cash_reserve_months: number | null
  assumed_inflation: number | null
  /** Undefined on a database that has not had the column added yet. */
  market_volatility?: number | null
  goal_levers: string | null
  tips_seen?: string | null
}

export function toSettings(r: SettingsRow): ExpenseSettings {
  return {
    cashReserveMonths: r.cash_reserve_months ?? 0,
    // Undefined too, on a database that has not had the column added yet.
    assumedInflation: r.assumed_inflation ?? DEFAULT_INFLATION_RATE,
    marketVolatility: r.market_volatility ?? DEFAULT_MARKET_VOLATILITY,
    openingCashCents: r.opening_cash_cents,
    openingInvestmentCents: r.opening_investment_cents,
    defaultAccountId: r.default_account_id ?? null,
    investmentCategoryId: r.investment_category_id ?? null,
    currencyCode: r.currency_code ?? DEFAULT_CURRENCY_CODE,
    numberLocale: r.number_locale ?? DEFAULT_NUMBER_LOCALE,
    claimantName: r.claimant_name ?? '',
    budgetRolloverDay: r.budget_rollover_day ?? DEFAULT_BUDGET_ROLLOVER_DAY,
    milestones: parseMilestones(r.milestones ?? null),
    // Undefined too, on a database that has not had the column added yet.
    goalLevers: parseLevers(r.goal_levers ?? null),
    ...tipsSeenField(r.tips_seen),
  }
}
