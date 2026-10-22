import { buildDescriptionIndex } from '../data/descriptionIndex'
import { recurringFixedGroups } from '../domain/engine'
import type { AttachmentCounts } from '../domain/data/ledgerParts'
import { type Ledger, assembleRows, ledgerDataset, ledgerMonths } from '../domain/ledger'
import type { Transaction } from '../types'
import { buildLookup } from './format'
import type { ExpenseModel, FixedHistory } from './useExpenseData'

export interface LedgerModelOptions {
  /**
   * The recurring series of the whole history, for a ledger that does not hold every row. Leave it out
   * for one that does: the engines then build their own from the rows they are handed, as they do today.
   */
  history?: FixedHistory
  /** Receipts per transaction, for a ledger whose receipt lists are read on request. */
  attachmentCounts?: AttachmentCounts
}

/** The series of `rows`, which must be the whole history. */
export function fixedHistoryOf(rows: Transaction[]): FixedHistory {
  return { groups: recurringFixedGroups(rows) }
}

/**
 * The model for a ledger. `dataset.transactions` is the real rows, which is what is shown as a transaction;
 * `sums` is set only when the ledger holds sums as well (a ledger of every row has none, and then both are
 * the same list, so the model is the one `buildExpenseModel` builds from the whole dataset).
 */
export function buildLedgerModel(ledger: Ledger, options: LedgerModelOptions = {}): ExpenseModel {
  const { real, linear } = assembleRows(ledger)
  const dataset = ledgerDataset(ledger, real)
  return {
    dataset,
    ...(linear.length === real.length ? {} : { sums: ledgerDataset(ledger, linear) }),
    lookup: buildLookup(dataset, options.attachmentCounts),
    descriptionIndex: buildDescriptionIndex(real),
    months: ledgerMonths(ledger),
    ...(options.history ? { history: options.history } : {}),
    ...(options.attachmentCounts ? { attachmentCounts: options.attachmentCounts } : {}),
  }
}
