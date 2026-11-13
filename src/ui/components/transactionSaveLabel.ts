import type { Transaction } from '../../types'

/**
 * The save button's words. While the save is in flight it says what is happening, which tells a person who tapped it
 * that something is moving.
 */
export function saveLabel({
  busy,
  uploading,
  editing,
  retrying,
  queueLeft,
}: {
  busy: boolean
  uploading: { done: number; total: number } | null
  editing: Transaction | null
  retrying: boolean
  /** How many captured payments wait after this one, when the form is one of a queue. */
  queueLeft?: number | undefined
}): string {
  if (uploading) return `Uploading receipt ${uploading.done + 1} of ${uploading.total}\u2026`
  // "Save and retry", not "Retry receipts": the press also sends any field the
  // user corrected while the banner was up.
  if (retrying) return busy ? 'Retrying\u2026' : 'Save and retry'
  if (busy) return 'Saving\u2026'
  if (editing) return 'Save changes'
  return queueLeft ? `Add and next (${queueLeft} left)` : 'Add transaction'
}
