/** Generic engine defaults for the public repo (no personal figures). */

export const DEFAULT_REAL_RETURN = 0.07
/**
 * The plan is real. This is the inflation it assumes wherever it meets a nominal figure:
 * check-in balances deflated before they are compared with the plan, the house and the
 * mortgage brought back to today's money, and the starting rate of the nominal view's
 * stepper (which is only for that view). One constant so they all agree.
 */
export const DEFAULT_INFLATION_RATE = 0.02
export const DEFAULT_HOUSE_APPRECIATION = 0.025

/** Fallback milestone ladder for owners who have not customised theirs. */
export const DEFAULT_MILESTONE_CENTS = [
  10_000_000, 20_000_000, 30_000_000, 40_000_000, 50_000_000, 75_000_000, 100_000_000,
] as const

/** Largest milestone amount accepted from the editor (€100M). */
export const MILESTONE_MAX_CENTS = 10_000_000_000
/** Cap on how many milestones fit legibly in the years-to-milestone matrix. */
export const MILESTONE_MAX_COUNT = 12
/** Cap on milestone label length, so matrix headers stay readable. */
export const MILESTONE_LABEL_MAX_LENGTH = 40

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
