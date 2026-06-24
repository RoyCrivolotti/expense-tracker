/** Generic engine defaults for the public repo (no personal figures). */

export const DEFAULT_REAL_RETURN = 0.07
export const DEFAULT_HOUSE_APPRECIATION = 0.025
export const DEFAULT_NET_RETENTION = 0.65
export const DEFAULT_ON_CALL_MONTHLY_CENTS = 50_000

export const MILESTONE_CENTS = [
  10_000_000, 20_000_000, 30_000_000, 40_000_000, 50_000_000, 75_000_000, 100_000_000,
] as const

export const DEFAULT_HOUSE_PRICE_CENTS = 400_000_000
export const DEFAULT_DOWN_PAYMENT_FRACTION = 0.2
export const DEFAULT_TRANSACTION_COSTS_CENTS = 50_000
export const DEFAULT_MORTGAGE_TERM_YEARS = 30
export const DEFAULT_MORTGAGE_RATE = 0.03
export const DEFAULT_RENT_MONTHLY_CENTS = 120_000
/** Annual home carry cost (maintenance + property tax + insurance) as a share of home value. */
export const DEFAULT_HOME_CARRY_RATE = 0.015
export const DEFAULT_ANNUAL_SPEND_CENTS = 4_000_000
export const DEFAULT_HORIZON_YEARS = 30
export const DEFAULT_SWR = 0.04

export const SCENARIO_COLORS = [
  '#6366f1',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
] as const
