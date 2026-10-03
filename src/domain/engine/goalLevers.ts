import type { GoalScenario } from '../types'

/**
 * The scenario inputs that can sit in the Goals page's levers bar: every number the controls
 * edit. The plan start date and the life events are not dials, so they cannot.
 */
export const LEVER_KEYS = [
  'startInvestedCents',
  'monthlyContributionCents',
  'annualContributionGrowth',
  'expectedRealReturn',
  'horizonYears',
  'housePriceCents',
  'downPaymentFraction',
  'transactionCostsCents',
  'mortgageRateAnnual',
  'mortgageTermYears',
  'houseAppreciationRate',
  'housePurchaseYear',
  'rentMonthlyCents',
  'annualSpendCents',
  'safeWithdrawalRate',
] as const satisfies readonly (keyof GoalScenario)[]

export type LeverKey = (typeof LEVER_KEYS)[number]

/** How many inputs the bar holds: one row of them beside the result. */
export const MAX_LEVERS = 5

/** What the bar shows until its owner picks their own: the inputs a plan is mostly tuned with. */
export const DEFAULT_LEVERS: readonly LeverKey[] = [
  'monthlyContributionCents',
  'expectedRealReturn',
  'horizonYears',
  'housePurchaseYear',
  'startInvestedCents',
]

export function isLeverKey(value: unknown): value is LeverKey {
  return typeof value === 'string' && (LEVER_KEYS as readonly string[]).includes(value)
}
