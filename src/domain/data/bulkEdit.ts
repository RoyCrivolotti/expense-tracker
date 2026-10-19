/**
 * Words the bulk writes answer with, shared by the D1 adapter and the in-memory repository so that
 * the two refuse a request in the same way.
 */

/**
 * A bulk write checks its rows and then writes them in one batch. This is the answer when a row
 * changed between the two: the batch is rolled back, so nothing was written.
 */
export const BULK_CHANGED_MESSAGE =
  'Some of those transactions were changed by someone else while this was being saved. Nothing was changed; look again and retry'
