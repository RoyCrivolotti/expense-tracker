import { useEffect } from 'react'
import type { ExpenseModel } from './useExpenseData'

/** Tells a model that reads `history` from the server that this screen uses it, for as long as the screen is mounted. */
export function useHistoryWatch({ watchHistory }: ExpenseModel): void {
  useEffect(() => watchHistory?.(), [watchHistory])
}
