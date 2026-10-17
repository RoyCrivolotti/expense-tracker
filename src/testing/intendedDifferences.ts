/**
 * Consumers whose output on the lists assembled from a ledger is expected to differ from their output
 * over every row, each with the reason. Written by hand from docs/ENGINE-HISTORY.md, not read back from
 * a run: the differential tests fail if a consumer outside the list differs, and also if a consumer in
 * it never does.
 */

/** Differences no choice of arguments removes: these read rows the lists do not hold. */
export const GLOBAL_DIFFERENCES: Record<string, string> = {
  latestEight: 'The eight newest rows by date: global and relative to today, not to the viewed month.',
  recentlyAdded: 'The eight newest rows by creation time: global and relative to today, not to the viewed month.',
  listAll:
    'The Transactions list over every date reads any month by its rows. It is served by an endpoint, not by these lists.',
}

/**
 * Differences while the engines build their own classifier or series from the rows they are handed, which
 * is what they do unless one is passed in. Passing the whole history's removes every one of them.
 */
export const OWN_CLASSIFIER_DIFFERENCES: Record<string, string> = {
  groupsByFixedFlexible:
    'Builds its own fixed or flexible classifier from the rows it is handed. A series needs three rows, and its median and regularity run over every gap, so a shorter history classifies a series differently.',
  detailByFixedFlexible: 'Builds its own classifier from the rows it is handed, as the groups do.',
  fixedCosts: 'Builds its own recurring groups from the rows it is handed, so it needs the whole series.',
  pace: 'The envelope (expected fixed spend) detects recurring monthly series from the rows it is handed, so it can miss one with fewer than three rows in the window or take a run of similar rows for one. Only the budget fields it feeds differ.',
  signals: 'Reads the pace, so it follows the pace envelope. Only the open month has a pace signal.',
}

/** Every intended difference when nothing is passed in. */
export const INTENDED_DIFFERENCES: Record<string, string> = { ...OWN_CLASSIFIER_DIFFERENCES, ...GLOBAL_DIFFERENCES }

/** The fields of the spending pace that come from the envelope; every other field must match. */
export const PACE_ENVELOPE_FIELDS = ['flexibleBudgetCents', 'shouldBeTodayCents']

/** Intended differences that cannot show while the viewed month is closed. */
export const ONLY_WHILE_OPEN = ['signals']
