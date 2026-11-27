import type { TransactionSeed } from './actions'

/** The payments waiting, in the list's order, seen from the form's. Each call hands back the form to show, if any. */
export interface SeedQueue {
  /** Where this one sits: `at` counts from 1, and is 0 once it no longer waits. Read again whenever `watch` calls. */
  spot: () => { at: number; of: number }
  watch: (listener: () => void) => () => void
  /** Once this one is saved: the one after it, or at the end of the list the one before. */
  next: () => TransactionSeed | undefined
  /** "Don't add" for this one, then as `next`. */
  dontAdd: () => TransactionSeed | undefined
  /** The one before or after, leaving this one waiting. */
  previous: () => TransactionSeed | undefined
  following: () => TransactionSeed | undefined
}

export type QueueSpot = ReturnType<SeedQueue['spot']>
