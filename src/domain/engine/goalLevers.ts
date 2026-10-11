import type { GoalScenario } from '../types'

/**
 * The scenario inputs that can sit in the Goals page's levers bar: the numbers a person steers a
 * plan with. The plan start date and the life events are not dials, nor are the upkeep rate
 * (`homeCarryRate`) and the years the money must last (`retirementYears`), which have no star and
 * are always on the page, so none of them can sit in the bar.
 */
export const LEVER_KEYS = [
  'startInvestedCents',
  'monthlyContributionCents',
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

/**
 * Why a list of levers cannot be saved, or null when it can: a list of at most MAX_LEVERS distinct
 * inputs. An empty list is allowed (a bar with only its result), and is not the same as never
 * having chosen, which is the defaults.
 */
export function leversError(value: unknown): string | null {
  if (!Array.isArray(value)) return 'goalLevers must be a list'
  if (value.length > MAX_LEVERS) return `goalLevers holds at most ${MAX_LEVERS} inputs`
  if (!value.every(isLeverKey)) return 'goalLevers has an input that is not one a scenario has'
  if (new Set(value).size !== value.length) return 'goalLevers lists an input twice'
  return null
}

/**
 * The stored column as a usable list. Null means the owner never chose, so the defaults apply.
 * Anything that is not a list of inputs also falls back to the defaults, so a damaged row shows
 * the familiar bar. A key that no scenario has any more (an input removed in a later version) is
 * dropped from a list that is otherwise good, and repeats and anything past the limit are cut.
 */
export function parseLevers(raw: string | null): LeverKey[] {
  if (raw === null) return [...DEFAULT_LEVERS]
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return [...DEFAULT_LEVERS]
    return [...new Set(parsed.filter(isLeverKey))].slice(0, MAX_LEVERS)
  } catch {
    return [...DEFAULT_LEVERS]
  }
}
