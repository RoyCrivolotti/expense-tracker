import {
  type DescriptionEntryIndex,
  type DescriptionIndex,
  type DescriptionIndexOptions,
  buildDescriptionIndex,
} from '../data/descriptionIndex'
import { recurringFixedGroups } from '../domain/engine'
import { foldNewerRows } from '../domain/engine/recurringFold'
import { type RecurringSeries, recurringFixedGroupsFromSeries } from '../domain/engine/recurringSeries'
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
  /**
   * For a window, whose older descriptions the server holds: how the index of the rows held is ordered, and what
   * adds the server's matches to it (`withOlderDescriptions`).
   */
  descriptions?: { index: DescriptionIndexOptions; wrap: (index: DescriptionEntryIndex) => DescriptionIndex }
}

function descriptionsOf(real: Transaction[], { descriptions }: LedgerModelOptions): DescriptionIndex {
  if (!descriptions) return buildDescriptionIndex(real)
  return descriptions.wrap(buildDescriptionIndex(real, descriptions.index))
}

/** The series of `rows`, which must be the whole history. */
export function fixedHistoryOf(rows: Transaction[]): FixedHistory {
  return { groups: recurringFixedGroups(rows) }
}

/**
 * The series of the whole history as the server serves them, for a ledger that does not hold every row, with the
 * rows written since they were read folded in (`foldNewerRows`), so that what a write adds to a series is seen at once.
 */
export function historyOfSeries(series: RecurringSeries[], rows: readonly Transaction[] = []): FixedHistory {
  return { groups: foldNewerRows(recurringFixedGroupsFromSeries(series), rows) }
}

/** The model with the history of those series, which are those of the whole ledger as the model's own rows add to them. */
export function withHistory(model: ExpenseModel, series: RecurringSeries[]): ExpenseModel {
  return { ...model, history: historyOfSeries(series, model.dataset.transactions) }
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
    descriptionIndex: descriptionsOf(real, options),
    months: ledgerMonths(ledger),
    ...(options.history ? { history: options.history } : {}),
    ...(options.attachmentCounts ? { attachmentCounts: options.attachmentCounts } : {}),
  }
}
