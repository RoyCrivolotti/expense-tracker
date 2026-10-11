/**
 * The yearly bounce of the market the spread card replays the plan with: how far a single year's return
 * strays from the typical one, as a fraction (0.15 = 15%). It is one setting for the owner, volatility only
 * and not tied to any plan's return, which stays the typical growth. The bounds are shared by the control,
 * the API and the in-memory double, so the three refuse the same values.
 */

/** About what world stocks have done a year, and what the replay uses until it is set. */
export const DEFAULT_MARKET_VOLATILITY = 0.15

/** No bounce at all is a line, and past half a year it is a typo. */
export const MARKET_VOLATILITY_MIN = 0
export const MARKET_VOLATILITY_MAX = 0.5

/** The choices the setting offers beside the stepper, from the usual one down. */
export const MARKET_VOLATILITY_PRESETS = [
  { value: 0.15, label: 'World stocks' },
  { value: 0.11, label: 'Stocks and bonds' },
  { value: 0.07, label: 'Mostly bonds' },
] as const

/** Null when `value` is a market bounce the app accepts, otherwise what is wrong with it. */
export function marketVolatilityError(value: unknown): string | null {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < MARKET_VOLATILITY_MIN ||
    value > MARKET_VOLATILITY_MAX
  ) {
    return `marketVolatility must be a number between ${MARKET_VOLATILITY_MIN} and ${MARKET_VOLATILITY_MAX}`
  }
  return null
}
