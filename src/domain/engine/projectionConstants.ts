/** Canonical defaults from finance-review scripts (03_refinement, 05_savings_sensitivity). */

export const DEFAULT_REAL_RETURN = 0.07
export const DEFAULT_HOUSE_APPRECIATION = 0.025
export const DEFAULT_NET_RETENTION = 0.65
export const DEFAULT_ON_CALL_MONTHLY_CENTS = 50_000

export const MILESTONE_CENTS = [
  10_000_000, 20_000_000, 30_000_000, 40_000_000, 50_000_000, 75_000_000, 100_000_000,
] as const

export const REMOVED_PATH_PRESETS = {
  path2: {
    name: 'Path 2: Investment-focused (no house)',
    startInvestedCents: 100_000_000,
    housePurchaseYear: null,
  },
  path3: {
    name: 'Path 3: House now (€400k @ 20% down)',
    startInvestedCents: 50_000_000,
    housePurchaseYear: 0,
  },
  path4: {
    name: 'Path 4: Invest then buy at year 5',
    startInvestedCents: 100_000_000,
    housePurchaseYear: 5,
  },
} as const

export const DEFAULT_HOUSE_PRICE_CENTS = 400_000_000
export const DOWN_PAYMENT_FRACTION = 0.3
export const TRANSACTION_COSTS_CENTS = 800_000
export const DEFAULT_MORTGAGE_TERM_YEARS = 30
export const DEFAULT_MORTGAGE_RATE = 0.02
export const DEFAULT_RENT_MONTHLY_CENTS = 150_000
export const DEFAULT_ANNUAL_CONTRIB_CENTS = 600_000

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
