import { useEffect } from 'react'
import type { ExpenseModel } from './useExpenseData'

/** Tells a model that reads `history` from the server that this screen uses it, for as long as the screen is mounted. */
export function useHistoryWatch({ watchHistory }: ExpenseModel): void {
  useEffect(() => watchHistory?.(), [watchHistory])
}

/**
 * True while a model that holds only some of the rows has no `history` yet. The monthly series need every row they
 * are made of, so a screen that reads them offers nothing until the history arrives, rather than series built from
 * the months that happen to be loaded.
 */
export function historyPending({ sums, history }: ExpenseModel): boolean {
  return sums !== undefined && history === undefined
}
