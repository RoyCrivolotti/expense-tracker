import type { ExpenseSettings } from './types'
import { leversError } from './engine/goalLevers'
import { marketVolatilityError } from './engine/marketVolatility'
import { assumedInflationError } from './engine/assumedInflation'
import { tipsSeenError } from './onboarding/tips'

/**
 * Why a settings patch cannot be kept, for the settings that name a list or a rate and not a plain number: the assumed
 * inflation, the market's bounce, the Goals bar's inputs and the tips put away. The API and the in-memory double check them
 * through this one function, so the two cannot disagree. Null when all that are present are fine.
 */
export function settingsPatchError(patch: Partial<ExpenseSettings>): string | null {
  if (patch.assumedInflation !== undefined) {
    const error = assumedInflationError(patch.assumedInflation)
    if (error) return error
  }
  if (patch.marketVolatility !== undefined) {
    const error = marketVolatilityError(patch.marketVolatility)
    if (error) return error
  }
  if (patch.goalLevers !== undefined) {
    const error = leversError(patch.goalLevers)
    if (error) return error
  }
  return patch.tipsSeen !== undefined ? tipsSeenError(patch.tipsSeen) : null
}
