/**
 * The inflation the Goals tab assumes, a yearly fraction (0.02 = 2%). It is one setting for
 * the owner, read wherever the plan meets a nominal figure. The bounds are shared by the
 * control, the API and the in-memory double, so the three refuse the same values.
 */

/** Past ten a year the number is a typo. */
export const INFLATION_MIN = 0
export const INFLATION_MAX = 0.1

/** Null when `value` is an assumed inflation the app accepts, otherwise what is wrong with it. */
export function assumedInflationError(value: unknown): string | null {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < INFLATION_MIN ||
    value > INFLATION_MAX
  ) {
    return `assumedInflation must be a number between ${INFLATION_MIN} and ${INFLATION_MAX}`
  }
  return null
}
