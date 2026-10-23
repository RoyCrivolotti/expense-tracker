# Keep a rollup of the ledger with triggers

For an engineer deciding how the ledger's totals are read. Route facts: [API.md](../API.md). Limits:
[SCALING.md](../SCALING.md).

**Context.** The cube and the per-month row counts are read by scanning `transactions`, so a cold open reads a few rows
per transaction however little the screen shows, and the Free plan allows 5 million rows read a day. Both answers are
sums over groups of rows, which a small table could hold if it stayed exact.

**Decision.** Migration 0039 adds two tables, `ledger_cells` and `ledger_months`, and five triggers on `transactions`
that keep them exact. A cell is one group of the cube: owner, `pinned`, budget month, account, category, type,
cancelled and the sign of the amount, with the sum and the count. A month is its row count, cancelled rows included.
Nothing reads them yet.

- **A cell depends on the row's own columns and nothing else.** `pinned` is the predicate of `idx_txn_pinned`. A payment
  that is pinned only because another row's `settled_by` points at it is a lookup in the same table, which a trigger
  cannot keep exact, so it is not here: a reader subtracts those few rows from the unpinned cells, as `paymentsSql`
  finds them.
- **Triggers take the old contribution out and put the new one in**, with upserts that cannot fail. An insert, a delete,
  an edit that moves a row to another cell and an edit of the month each have one. An edit that changes only an amount
  within a cell updates that cell once. An edit that changes no column of a cell writes nothing, even though the form
  sends every column.
- **A cell or month whose count reaches 0 is deleted by the trigger**, so each table is always the `GROUP BY` of
  `transactions` and a drift check can compare them whole. The other way, leaving dead cells for the reader to skip, saves
  one written row when a cell empties and lets dead cells accumulate for every combination ever used. A reader that
  forgot to skip them would count them toward `MAX_CUBE_CELLS` and refuse a small cube. A cell that goes below 0 means a
  missing cell, and a reader should refuse it.
- **The tables are filled in the same file, by one statement each after the triggers exist.** The statement also covers
  the keys the table already holds, because a row deleted after the triggers and before the statement leaves a negative
  cell that a plain `GROUP BY` would not visit. A `DELETE` of the empty ones follows.
- **The proof is an oracle that never reads the rollup** (`ledgerRollup.integration.test.ts`). After every write of a
  seeded walk through the routes, and of the named hazards, the cells equal a fresh `GROUP BY`, the months equal the
  per-month counts, no count is negative, and the cube built from the cells equals `cubeSql` and `buildCells` over
  `loadDataset`. `ledgerRollupMutants.integration.test.ts` weakens each trigger and the backfill in turn, and requires
  the oracle to fail for each.

**Consequences.**
- Every write to `transactions` writes more rows against the 100,000 a day. Counted on SQLite, the triggers add:

  | Write | Rows written without the triggers | Added by them |
  | --- | --- | --- |
  | Insert an expense | 8 (the row and seven indexes), 9 through the API | 2 |
  | Change a row's category | 2 | 2, or 3 when the old cell empties |
  | Change a row's month | 3 | 4, or 6 when the row was alone in its cell and month |
  | Change the amount alone | 1 | 1 |
  | Re-send the edit form unchanged | 7 | 0 |
  | Delete a row | 1 | 2, or 4 when it was the last of its cell and month |
  | Bulk edit of 500 rows, category | 1,000 | 1,001 |
  | Bulk create of 500 rows | 4,500 | 1,000 |
  | Bulk delete of 500 rows | 500 | 1,002 |

  The numbers in the last column are held by `ledgerRollupWrites.integration.test.ts`. The first column is the rows and
  index entries the statements touch, which [SCALING.md](../SCALING.md) measured on D1 for an insert, a category change
  and a delete.
- **Not verified: whether D1 bills a trigger's writes as rows written, whether it accepts `CREATE TRIGGER` in a file given
  to `wrangler d1 execute --file`, and whether `meta.changes` counts them.** The table assumes it bills them. Measure all
  three on a throwaway database before this migration reaches `main`, because the deploy applies it to the dev database
  and, once approved, production.
- `meta.changes` reaches a client in two places that write a trigger column: the `deleted` of `DELETE
  /transactions/bulk` and the `unflagged` of `DELETE /flags/:id`. SQLite's own count leaves out trigger writes, and a test
  pins that locally (`countsTheApiSends`), but if D1 counted them both answers would be too large. Every other use only
  tests for 0 to answer 404, which a trigger cannot change since it writes nothing when no row did, reads a table without
  triggers (labels), or sets `description_norm` alone, which no trigger watches.
- **Nothing may replace a row of `transactions`.** `INSERT OR REPLACE` and `REPLACE INTO` delete a conflicting row without
  firing the delete trigger. Nothing in the repository does it, and `ledgerRollup.integration.test.ts` fails if something
  does. `INSERT ... ON CONFLICT DO NOTHING`, which the instalment backfill uses, fires no trigger for a row it skips.
- **A migration that rebuilds `transactions` drops the triggers.** `npm run check:schema` expects both tables and all five
  triggers on every database once 0039 is applied, and fails when one is missing.
- The pinned rule is now written in five places (see [ARCHITECTURE.md](../ARCHITECTURE.md)), and changing it needs a
  migration that drops and creates the triggers and fills the cells again.
- The backfill writes one row per cell and month, which is between a quarter and three fifths of the rows. A ledger
  whose cells would not fit in a day's budget needs the backfill split by month.

**Not chosen.**
- **Maintaining the rollup in the repository code.** A statement that forgets to maintain it, a script or SQL by hand
  would leave it wrong, where a trigger sees every write.
- **Membership that depends on other rows**, such as being the target of a `settled_by`. A trigger would have to move a
  payment between cells whenever another row's link changes, and it cannot keep that exact across a batch.
- **Covering indexes.** They cannot get below about one row read per row per request and cost a written row per insert
  and one per existing row to build.
- **Leaving dead cells for the reader to skip**, above.
