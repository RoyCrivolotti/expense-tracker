/**
 * Consumers whose output on the lists assembled from a ledger is expected to differ from their output
 * over every row, each with the reason. Written by hand from docs/ENGINE-HISTORY.md, not read back from
 * a run: the differential tests fail if a consumer outside this list differs, and also if a consumer in
 * it never does. `src/domain/ledger` is not meant to fix any of these; the listed engines need
 * something the rows in a window cannot supply.
 */
export const INTENDED_DIFFERENCES: Record<string, string> = {
  groupsByFixedFlexible:
    'Builds its own fixed or flexible classifier from the rows it is handed. A series needs three rows, and its median and regularity run over every gap, so a shorter history classifies a series differently. Needs the classifier passed in.',
  detailByFixedFlexible: 'Builds its own classifier from the rows it is handed, as the groups do.',
  fixedCosts: 'Builds its own recurring groups from the rows it is handed, so it needs the whole series.',
  pace: 'The envelope (expected fixed spend) detects recurring monthly series from the rows it is handed, so it can miss one with fewer than three rows in the window or take a run of similar rows for one. Only the budget fields it feeds differ. Needs the series passed in.',
  signals: 'Reads the pace, so it follows the pace envelope. Only the open month has a pace signal.',
  latestEight: 'The eight newest rows by date: global and relative to today, not to the viewed month.',
  recentlyAdded: 'The eight newest rows by creation time: global and relative to today, not to the viewed month.',
  listAll: 'The Transactions list over every date reads any month by its rows. It is served by an endpoint, not by these lists.',
}

/** The fields of the spending pace that come from the envelope; every other field must match. */
export const PACE_ENVELOPE_FIELDS = ['flexibleBudgetCents', 'shouldBeTodayCents']

/** Intended differences that cannot show while the viewed month is closed. */
export const ONLY_WHILE_OPEN = ['signals']
