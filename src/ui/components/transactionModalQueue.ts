import { useRef } from 'react'
import type { NewTransaction } from '../../data/dataSource'
import type { Transaction } from '../../types'
import type { ExpenseActions, TransactionSeed } from '../actions'
import { useToast } from '../hooks/useToast'
import type { InstallmentIntent } from './installmentIntent'
import { saveTransaction } from './transactionSaveIntent'

/**
 * What the add form does at the end of a queue of captured payments: after a save it opens the next payment's form in
 * place of closing, and "Don't add" hands over the same way. Without a queue it only closes.
 */
export function useQueueAdvance(
  seed: TransactionSeed | undefined,
  actions: ExpenseActions,
  onClose: () => void,
  editing: Transaction | null,
) {
  const next = useRef<TransactionSeed | undefined>(undefined)
  // What to tell when a card could not be remembered after its payment was saved, once the form has said it was added.
  const notRemembered = useRef<string | null>(null)
  const { showToast } = useToast()
  const queue = seed?.queue
  return {
    /** Saves the form. After a create it asks the queue what comes next. */
    submit: async (input: NewTransaction, id?: number, intent?: InstallmentIntent) => {
      const card = seed?.card
      // A card is asked about so that the account is never a guess: nothing is saved until it is answered.
      if (id == null && card && card.answer.accountId === null) throw new Error(card.unanswered)
      const saved = await saveTransaction(actions, input, id, intent, seed?.recommendationId)
      // Remembered after the payment is saved, so the message is only ever about a payment that was added, and before
      // the queue moves on, so the payments behind this one already know the account.
      if (saved && card?.answer.remember) notRemembered.current = await card.remember(input.accountId)
      if (saved) next.current = queue?.next()
      return saved
    },
    /** The form's identity: a new payment gets a fresh form, so its fields start from its own seed. */
    formKey: editing?.id ?? seed?.recommendationId ?? 'new',
    /** Called when the form has finished with a save. */
    finish: () => {
      if (notRemembered.current) showToast(notRemembered.current, 'error')
      notRemembered.current = null
      if (next.current) actions.onAdd(next.current)
      else onClose()
    },
    /** The form's own labels for a queue, or undefined when there is none. */
    forForm: queue
      ? {
          left: queue.left,
          onSkip: () => {
            const following = queue.dontAdd()
            if (following) actions.onAdd(following)
            else onClose()
          },
        }
      : undefined,
  }
}
