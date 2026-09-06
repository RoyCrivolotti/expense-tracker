/**
 * Pure builder/validator for the "focused card" batch-entry trial: a flat
 * sequence of full single-transaction drafts (unlike batchTransactionIntent's
 * date-grouped rows) translated into the `NewTransaction[]` the bulk-create
 * endpoint expects. No I/O — the form applies the result on save via
 * `ExpenseActions.createTransactions`.
 */
import type { NewTransaction } from '../../data/dataSource'
import { parseMoneyToCents, type MoneyFormat } from '../../engine/money'
import type { FormFields } from './transactionFormState'

export interface FocusedDraft extends FormFields {
  /** Client-only key for React list rendering and error lookup; not persisted. */
  id: string
}

export type BuildFocusedResult =
  | { ok: true; transactions: NewTransaction[] }
  // draftId -> message; empty when nothing was entered anywhere (nothing to save).
  | { ok: false; errors: Record<string, string> }

export function isDraftEmpty(draft: FormFields): boolean {
  return draft.description.trim() === '' && draft.amount.trim() === ''
}

/** Validate every non-empty draft and map to NewTransaction[]. */
export function buildFocusedTransactions(
  drafts: FocusedDraft[],
  format: MoneyFormat,
): BuildFocusedResult {
  const transactions: NewTransaction[] = []
  const errors: Record<string, string> = {}

  for (const draft of drafts) {
    if (isDraftEmpty(draft)) continue
    const cents = Math.abs(parseMoneyToCents(draft.amount, format))
    if (cents <= 0) {
      errors[draft.id] = 'Enter an amount greater than zero'
      continue
    }
    transactions.push({
      date: draft.date,
      budgetMonth: draft.budgetMonth,
      description: draft.description.trim(),
      accountId: draft.accountId,
      categoryId: draft.categoryId,
      type: draft.type,
      amountCents: cents,
      cancelled: false,
      ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
    })
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  if (transactions.length === 0) return { ok: false, errors: {} }
  return { ok: true, transactions }
}
