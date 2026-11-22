import { TIP_IDS } from '../../domain/onboarding/tips'
import type { ExpenseModel } from '../useExpenseData'
import { useTips } from './tipsContext'

/** How many transactions the account has: a window holds only some of them, and says how many there are in all. */
export function transactionCount(model: Pick<ExpenseModel, 'dataset' | 'exportAll'>): number {
  return model.exportAll?.count ?? model.dataset.transactions.length
}

/**
 * Whether the form's lines of advice may show at all: not in a session that cannot write, and not to a person who was
 * already here before tips existed. The rest of their rules read the transaction count.
 */
export function useFormLinesActive(): boolean {
  return useTips().isShown(TIP_IDS.formLines)
}
