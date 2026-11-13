import { createContext, useContext } from 'react'
import type { Transaction } from '../../types'
import type { NewTransaction } from '../../data/dataSource'
import type { RecommendationInfo } from '../../data/recommendationsApi'
import type { TransactionSeed } from '../actions'
import type { ExpenseModel } from '../useExpenseData'

/**
 * What the app keeps of the payments waiting for a look: the list, its count and the undo window. The code that turns a
 * payment into the fields a person sees is not here, so it can load with the card and not with the app.
 */
export interface ReviewCore {
  model: ExpenseModel
  /** The payments not yet decided here, newest day first. One waiting out its undo is not among them. */
  items: RecommendationInfo[]
  /** How many are open, counting those not loaded yet. */
  count: number
  hasMore: boolean
  more: () => void
  error: string | null
  retry: () => void
  /** Why a payment came back after a failed send, by id. */
  failures: ReadonlyMap<string, string>
  /** False where the app cannot write (offline copy, read-only source): the rows are shown with no buttons. */
  canWrite: boolean
  /**
   * Hides the payment, holds `send` for the undo window and shows `message`. A send that fails puts the payment back
   * with the reason and says `Couldn't ${failure}`. A new decision sends the held one at once.
   */
  decide: (id: string, message: string, failure: string, send: () => Promise<unknown>) => void
  /** Creates the transaction for a payment through its recommendation. Absent where the app cannot write. */
  submit?: ((id: string, input: NewTransaction) => Promise<Transaction>) | undefined
  /** Opens the add form. The form saves at once, so anything held is sent first. */
  openForm: (seed: TransactionSeed) => void
}

export const ReviewContext = createContext<ReviewCore | null>(null)

/** Null when the capture flag is off or no provider is mounted. */
export function useReviewCore(): ReviewCore | null {
  return useContext(ReviewContext)
}

/** The count the Dashboard tab shows. Zero without a provider. */
export function useReviewCount(): number {
  return useContext(ReviewContext)?.count ?? 0
}
