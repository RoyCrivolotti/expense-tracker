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
- **Every write to `transactions` writes more rows against the 100,000 a day, and D1 bills them.** Measured on
  2026-10-24 on a throwaway D1 database (since deleted), rows written without and with the triggers:

  | Write | Without | With | Added |
  | --- | --- | --- | --- |
  | Insert one expense | 9 | 11 | 2 |
  | Change a row's category to a new cell | 2 | 4 | 2 |
  | Change the amount alone | 1 | 2 | 1 |
  | Change the description alone | 1 | 1 | 0 |
  | Re-send columns unchanged | 5 | 5 | 0 |
  | Change the month of the only row in its cell, the month keeps others | 3 | 8 | 5 |
  | Delete the last row of its cell, the month keeps others | 1 | 4 | 3 |
  | Insert 20 rows in one statement | 161 | 201 | 40 |
  | Change the category of 20 rows | 40 | 80 | 40 |
  | Delete 20 rows | 20 | 61 | 41 |

  Counted on SQLite the same way, which agrees where both exist and adds the cases the probe did not run
  (`ledgerRollupWrites.integration.test.ts` holds them): a category change adds 3 when it empties the old cell, a
  month change 4 when the row's cell and month keep others and 6 when it was alone in both, a delete 4 when it empties
  its cell and month, and 500 rows add 1,001 for a category change, 1,000 for a bulk create and 1,002 for a bulk delete.
  The backfill of 60 rows wrote 21 (its cells and months).
- **`wrangler d1 execute --file` accepts the file**: two tables and five triggers were created, the backfill matched a
  `GROUP BY` exactly, and after inserts, edits and deletes the cells and months still did.
- **D1's `meta.changes` counts the rows triggers write; SQLite's `changes()` does not.** Measured: one insert reports 3,
  20 inserted in one statement 60, a category change of 20 rows 60, a delete of 20 rows 61, one delete 4, an amount
  alone 2. `node:sqlite` reports the SQLite count and so hid this, which is why the test stand-in
  (`src/testing/sqliteD1.ts`) now reports the change in `total_changes()` across a statement, as D1 does. A count sent to
  a client is therefore read, not taken from `meta.changes`: `deleted` of `DELETE /transactions/bulk` and
  `unflagged` of `DELETE /flags/:id` come from a `COUNT(*)` in the same batch, ahead of the write. Every other use
  of `meta.changes` only tests for 0 to answer 404 (a statement that changes no row fires no trigger), or is on a table
  no trigger writes through, and `metaChangesUses.test.ts` lists each of them with the reason and fails for a new one.
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
