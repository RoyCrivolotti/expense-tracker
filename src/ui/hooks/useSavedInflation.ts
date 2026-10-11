import type { ExpenseSettings } from '../../types'
import { useSavedSetting } from './useSavedSetting'

type Save = (patch: Partial<ExpenseSettings>) => void | Promise<void>

/** The stepper side of the owner's assumed inflation: `useSavedSetting` for that one setting. */
export function useSavedInflation(value: number, onChange: Save) {
  return useSavedSetting('assumedInflation', value, onChange)
}
