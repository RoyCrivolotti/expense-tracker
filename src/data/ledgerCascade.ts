/**
 * Writes whose effects on the server reach rows or tables that the screens' dataset cannot show. The patch
 * functions in `src/ui/datasetPatches.ts` mirror some of these by hand and miss others (a deleted payment
 * leaves the rows it settled settled; a flag's label is not added to the row; a plan's instalments are
 * inserted by the server), and a mirror drifts when the server's rule changes. A cascade is recognised from
 * what the patch did to the dataset and answered by reading the ledger again, which is the only source
 * that knows.
 */
import type { ExpenseDataset, Transaction } from '../domain/types'
import { settlementPaymentIds } from '../domain/ledger'

export type Cascade = 'deleted' | 'autoLabel' | 'plan' | 'settled'

const LISTS = ['categories', 'accounts', 'flags', 'labels', 'installmentPlans'] as const

/** A category, account, flag, label or plan went: the server moved, unlinked or cleared what pointed at it. */
function deletedEntry(before: ExpenseDataset, after: ExpenseDataset): boolean {
  return LISTS.some((list) => before[list].some((entry) => !after[list].some((now) => now.id === entry.id)))
}

/** A flag was given an auto-label, which the server applies to every row already carrying the flag. */
function autoLabelSet(before: ExpenseDataset, after: ExpenseDataset): boolean {
  return after.flags.some((flag) => {
    const was = before.flags.find((f) => f.id === flag.id)
    return was !== undefined && flag.autoLabelId != null && was.autoLabelId !== flag.autoLabelId
  })
}

/** A plan was added or changed, which the server answers by inserting the instalments that are due. */
function planWritten(before: ExpenseDataset, after: ExpenseDataset): boolean {
  return after.installmentPlans.some((plan) => {
    const was = before.installmentPlans.find((p) => p.id === plan.id)
    return !was || JSON.stringify({ ...was, active: 0 }) !== JSON.stringify({ ...plan, active: 0 })
  })
}

function rowsById(rows: readonly Transaction[]): Map<number, Transaction> {
  return new Map(rows.map((row) => [row.id, row]))
}

/**
 * A row was settled (the server stamps the payment with what it covered), or a payment other rows were
 * settled by was deleted (the server clears those rows).
 */
function settlementChanged(before: ExpenseDataset, after: ExpenseDataset): boolean {
  const was = rowsById(before.transactions)
  const now = rowsById(after.transactions)
  for (const id of settlementPaymentIds(before.transactions)) if (was.has(id) && !now.has(id)) return true
  return after.transactions.some((row) => row.settledBy != null && was.get(row.id)?.settledBy !== row.settledBy)
}

/** A row was given a flag whose auto-label it does not carry: the server adds it, the patch did not. */
function rowMissingAutoLabel(before: ExpenseDataset, after: ExpenseDataset): boolean {
  const was = rowsById(before.transactions)
  return after.transactions.some((row) => {
    if (row.flagId == null || was.get(row.id)?.flagId === row.flagId) return false
    const label = after.flags.find((flag) => flag.id === row.flagId)?.autoLabelId
    return label != null && !(row.labelIds ?? []).includes(label)
  })
}

/** Why the write needs the ledger read again, or null when the patch shows everything it did. */
export function cascadeOf(before: ExpenseDataset, after: ExpenseDataset): Cascade | null {
  if (deletedEntry(before, after)) return 'deleted'
  if (autoLabelSet(before, after) || rowMissingAutoLabel(before, after)) return 'autoLabel'
  if (planWritten(before, after)) return 'plan'
  if (settlementChanged(before, after)) return 'settled'
  return null
}
