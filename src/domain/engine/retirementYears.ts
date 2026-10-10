/**
 * How long the money must last after financial independence, and what that does to the withdrawal rate
 * that is safe: the longer, the lower. The guide is the usual one for a retirement of a given length,
 * not a promise, and the rate stays the owner's: it follows the years only while it is the guide.
 */
import { fireNumber } from './projection'

/**
 * The rate that is the guide for a retirement of up to this many years, from the shortest band to the longest. The
 * last band has no end, written as `Infinity` and not `Number.POSITIVE_INFINITY`: a property read on a global at the top
 * of a module counts as a side effect to the bundler, which then keeps the module in the main chunk and pulls the
 * whole engine in with it.
 */
export const RETIREMENT_RATE_BANDS = [
  { upTo: 35, rate: 0.04 },
  { upTo: 49, rate: 0.035 },
  { upTo: Infinity, rate: 0.0325 },
] as const

/** The rates the FI target is shown at side by side, from the usual one down. */
export const FI_TARGET_RATES = [0.04, 0.035, 0.03] as const

/**
 * What a plan made from now on starts with: the money lasting 40 years, which is the length of a retirement that begins
 * early, and the rate that is the guide for it. Not `DEFAULT_RETIREMENT_YEARS` (30), which is what a scenario that says
 * nothing is read as, so every saved one that predates the field keeps the 30 years it was always drawn over.
 */
export const NEW_PLAN_RETIREMENT_YEARS = 40
export const NEW_PLAN_WITHDRAWAL_RATE = 0.035

/** Two rates this close are the same rate: one that was typed in as a percentage is not exactly the constant. */
const SAME_RATE = 1e-9

/** The usual withdrawal rate for money that has to last this many years. */
export function recommendedWithdrawalRate(years: number): number {
  // The last band has no end, so one always matches.
  return RETIREMENT_RATE_BANDS.find((b) => years <= b.upTo)?.rate ?? RETIREMENT_RATE_BANDS[2].rate
}

/**
 * The patch for changing how many years the money must last. The withdrawal rate goes with it when it
 * is the guide for the years it had, since then nobody chose it; a rate someone set themselves, or one
 * that is not the guide for those years, is left alone.
 */
export function fiPatchForYears(
  current: { retirementYears: number; safeWithdrawalRate: number },
  years: number,
): { retirementYears: number; safeWithdrawalRate?: number } {
  const wasGuide = Math.abs(current.safeWithdrawalRate - recommendedWithdrawalRate(current.retirementYears)) < SAME_RATE
  return wasGuide ? { retirementYears: years, safeWithdrawalRate: recommendedWithdrawalRate(years) } : { retirementYears: years }
}

/** What a year of spending needs saved up at each of the rates the target is shown at. */
export function fiTargetsCents(annualSpendCents: number): { rate: number; targetCents: number }[] {
  return FI_TARGET_RATES.map((rate) => ({ rate, targetCents: fireNumber(annualSpendCents, rate) }))
}
