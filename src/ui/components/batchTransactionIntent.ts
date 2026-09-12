/**
 * Pure builder/validator translating batch-add draft state (one or more dated
 * batches, each holding several transaction-row drafts) into the flat
 * `NewTransaction[]` the bulk-create endpoint expects. No I/O: the batch form
 * applies the result on save via `ExpenseActions.createTransactions`.
 */
import type { NewTransaction } from '../../data/dataSource'
import type { TxnType } from '../../types'
import { defaultBudgetMonth } from '../../engine/dates'
import { parseMoneyToCents, type MoneyFormat } from '../../engine/money'

export interface BatchRowDraft {
  /** Client-only key for React list rendering and error lookup; not persisted. */
  id: string
  type: TxnType
  amount: string
  description: string
  categoryId: number
  accountId: number
}

export interface DateBatchDraft {
  id: string
  date: string
  rows: BatchRowDraft[]
}

export type BuildBatchResult =
  | { ok: true; transactions: NewTransaction[] }
  // rowId -> message; empty when nothing was entered anywhere (nothing to save).
  | { ok: false; errors: Record<string, string> }

export function isRowEmpty(row: BatchRowDraft): boolean {
  return row.description.trim() === '' && row.amount.trim() === ''
}

/**
 * Validate every non-empty row across all batches and flatten to NewTransaction[].
 *
 * `flagId` is form-level rather than per-row: the case it exists for is "flag
 * this whole trip", and at 375px a batch row is already a full 3x2 grid with no
 * cell to spare. When it is null the key is *omitted* rather than sent as null —
 * `NewTransaction.flagId` uses null to mean "clear it", which is meaningless on
 * a row that does not exist yet, and under `exactOptionalPropertyTypes` absence
 * is the only way to say "leave it alone" (see `withoutFlag` in flagGroups.ts).
 */
export function buildBatchTransactions(
  batches: DateBatchDraft[],
  format: MoneyFormat,
  budgetRolloverDay: number,
  flagId: number | null = null,
): BuildBatchResult {
  const transactions: NewTransaction[] = []
  const errors: Record<string, string> = {}

  for (const batch of batches) {
    const budgetMonth = defaultBudgetMonth(batch.date, budgetRolloverDay)
    for (const row of batch.rows) {
      if (isRowEmpty(row)) continue
      const cents = Math.abs(parseMoneyToCents(row.amount, format))
      if (cents <= 0) {
        errors[row.id] = 'Enter an amount greater than zero'
        continue
      }
      transactions.push({
        date: batch.date,
        budgetMonth,
        description: row.description.trim(),
        accountId: row.accountId,
        categoryId: row.categoryId,
        type: row.type,
        amountCents: cents,
        cancelled: false,
        ...(flagId != null ? { flagId } : {}),
      })
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  if (transactions.length === 0) return { ok: false, errors: {} }
  return { ok: true, transactions }
}
