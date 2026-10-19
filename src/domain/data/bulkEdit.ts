/**
 * What a bulk write on a filter is allowed to reach, and the words it answers with. The D1 adapter and
 * the in-memory repository both import this file, so that the two refuse a request in the same way.
 */
import type { TxnFilter } from '../engine/transactions'

/**
 * The most rows one edit on a filter may change. A filter that matches more is refused rather than cut
 * short: an edit applied to the first 5,000 of 7,000 matches would be a different edit from the one the
 * user was shown. The cap keeps one request inside the Free plan's Worker CPU, query and row budgets.
 */
export const MAX_FILTER_EDIT_ROWS = 5_000

/**
 * The most label links one request may add (rows times labels). Each link is a row written in the table
 * and in its three indexes, against 100,000 rows written a day on the Free plan.
 */
export const MAX_BULK_LABEL_LINKS = 5_000

/** Most labels one request may name; the product with the rows is what {@link MAX_BULK_LABEL_LINKS} bounds. */
export const MAX_BULK_LABELS = 20

/**
 * A bulk write checks its rows and then writes them in one batch. This is the answer when a row
 * changed between the two: the batch is rolled back, so nothing was written.
 */
export const BULK_CHANGED_MESSAGE =
  'Some of those transactions were changed by someone else while this was being saved. Nothing was changed; look again and retry'

/** The ledger was written to after the user looked at the rows the edit was meant for. */
export const BULK_REVISION_MESSAGE =
  'The ledger changed since you looked at these transactions. Nothing was changed; look again and retry'

/** The filter matches a different number of rows from the one the user was shown. */
export function bulkCountMessage(found: number, expected: number): string {
  return `${found} transactions match, not the ${expected} you were shown. Nothing was changed; look again and retry`
}

export function bulkTooManyMessage(cap = MAX_FILTER_EDIT_ROWS): string {
  return `More than ${cap.toLocaleString('en-US')} transactions match. Narrow the filter to edit them`
}

export function bulkTooManyLinksMessage(): string {
  return `A request may add at most ${MAX_BULK_LABEL_LINKS.toLocaleString('en-US')} labels in all (transactions times labels)`
}

/** The rows a bulk write is meant for, as the user saw them: a filter, and how many rows it matched. */
export interface FilterTarget {
  filter: TxnFilter
  expectedCount: number
}

/** Rows named one by one, or the rows a filter matches. */
export type BulkTarget = { ids: number[] } | FilterTarget

export function isFilterTarget(target: BulkTarget): target is FilterTarget {
  return 'filter' in target
}
