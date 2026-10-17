-- An index of the rows that stay real in any month, for GET /api/expenses/reference (docs/SCALING.md,
-- "Ledger parts"). That route sends every pinned row whatever its age: investments, rows tied to an
-- instalment plan, a flag or a settlement, and payments that cover other rows. Three of those already
-- have a partial index (plan_id, flag_id, settled_by). Investments and payments with a covered count
-- have none, and a statement that has to look for them reads every row the owner has.
--
-- It is keyed on (owner, date) because the route returns the rows newest first: the row id breaks ties
-- in the same direction (it is the rowid, stored last in every index), so no sort is needed. Keyed on
-- (owner, id), SQLite preferred to walk idx_txn_owner_date to avoid the sort and read every row.
--
-- A partial index holds only the rows that satisfy its WHERE, so an ordinary expense, which is nearly
-- every row, pays no written row for it. An inserted investment, plan row, flagged row or settled row
-- pays one (Cloudflare's Free plan allows 100,000 rows written a day), and so does an update that makes
-- a row one of them or stops it being one. SQLite reads a partial index only when the statement's WHERE
-- holds the index's WHERE as one of its terms, so the predicate must hold the same terms as
-- `PINNED_SQL` in functions/_shared/ledgerPartsSql.ts; ledgerPartPlans.test.ts fails when it stops doing so.
--
-- The cube route (GET /api/expenses/cube) needs no index of its own: it is served by
-- idx_txn_owner_month_date, and docs/SCALING.md records why a covering index was not added.
--
-- No owner-scoped statement here, so nothing to substitute before applying. Applying it before or after
-- the code that reads through it changes how many rows the reference route reads, not what it returns.
--
-- Applied by the deploy, which records it in _migrations (docs/DEPLOYMENT.md), or by hand with
--   npm run migrate -- <database> --apply
-- Running the file with wrangler on its own does not record it, and the next deploy then tries to create the index again.

CREATE INDEX IF NOT EXISTS idx_txn_pinned ON transactions (owner, date)
  WHERE type = 'investment' OR plan_id IS NOT NULL OR flag_id IS NOT NULL
    OR settled_by IS NOT NULL OR report_count > 0;
