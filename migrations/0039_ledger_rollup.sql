-- Two small tables that count the ledger, kept exact by triggers on `transactions`, so a later read can
-- answer "how much, per month, account, category and type" from a few thousand cells and not from every
-- row (docs/decisions/ledger-rollup.md). Nothing reads them yet: applying this changes no response.
--
-- `ledger_cells` has one row per (owner, pinned, budget month, account, category, type, cancelled, sign of
-- the amount) holding the sum of the amounts and the number of rows. It matches the groups of `cubeSql`
-- (functions/_shared/ledgerPartsSql.ts) with `pinned` added to the key. `ledger_months` has one row per
-- (owner, budget month) holding the number of rows, cancelled ones included. Both are WITHOUT ROWID, so
-- the primary key is the table and there is no second b-tree to write.
--
-- A cell depends on the row's own columns and nothing else, because that is all a trigger can keep exact.
-- `pinned` is the predicate of `idx_txn_pinned` (0037), word for word: an investment, or a row with a plan,
-- a flag, a settlement or a covered count. A row that is pinned only because another row points at it
-- through `settled_by` is a lookup in the same table, so it is not here: a reader subtracts those few rows
-- from the unpinned cells at read time, as `paymentsSql` finds them.
--
-- A trigger takes the old row's contribution out and puts the new one in, with upserts that cannot fail. A
-- cell whose count reaches 0 is deleted, so the table is always the GROUP BY of `transactions` and no
-- reader has to remember to skip empty cells. A cell missing when a row leaves it, or moves out of it, becomes a
-- cell with a negative count and not a silent no-op, so a reader can refuse it. The trigger for an edit of the
-- amount alone is a plain UPDATE: with its cell missing it does nothing, and only a comparison with the GROUP BY
-- finds that. An UPDATE that changes none of the columns that make up a cell writes nothing; one that changes
-- only an amount in the same cell writes one row.
--
-- Each table is filled by one INSERT OR REPLACE statement that runs after the triggers exist, so no write
-- falls between the two: a row written before the statement is counted by it, and one written after is
-- counted by a trigger. The statement also covers the keys the table already holds, because a row deleted
-- after the triggers and before the statement leaves a negative cell that a plain GROUP BY would not visit;
-- a DELETE of the empty ones follows. INSERT OR REPLACE is used on the two new tables only: on `transactions`
-- it would delete rows without firing the delete trigger, so no statement may ever do that. The file can be
-- applied twice.
--
-- Every row a trigger writes is a written row against the 100,000 a day Cloudflare's Free plan allows. An insert
-- writes 2. A delete writes 2, or 4 when it empties its cell and its month. An edit that moves a row to another
-- cell writes 2 (3 when the old cell empties), one that moves it to another month 4 (6 when it was alone in
-- both), an edit of the amount alone 1, and an edit of any other column 0. The backfill writes one row per cell
-- and per month, between a quarter and three fifths of the rows (an estimate from one 60-row run on D1, which wrote
-- 21). D1 bills these as rows written, and counts them in
-- `meta.changes` too, so a count sent to a client must be read and not taken from it (docs/decisions/ledger-rollup.md).
--
-- A migration that rebuilds `transactions` drops the triggers with it and has to create them again.
-- `npm run check:schema` expects both tables and all five triggers on every database from here on.
--
-- No owner-scoped statement here, so nothing to substitute before applying. The code does not read these
-- tables, so apply it before or after the deploy.
--
-- Applied by the deploy, which records it in _migrations (docs/DEPLOYMENT.md), or by hand with
--   npm run migrate -- <database> --apply

CREATE TABLE IF NOT EXISTS ledger_cells (
  owner TEXT NOT NULL,
  pinned INTEGER NOT NULL,
  budget_month TEXT NOT NULL,
  account_id INTEGER NOT NULL,
  category_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  cancelled INTEGER NOT NULL,
  sign INTEGER NOT NULL,
  sum_cents INTEGER NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (owner, pinned, budget_month, account_id, category_id, type, cancelled, sign)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS ledger_months (
  owner TEXT NOT NULL,
  budget_month TEXT NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (owner, budget_month)
) WITHOUT ROWID;

CREATE TRIGGER IF NOT EXISTS ledger_rollup_ai AFTER INSERT ON transactions
BEGIN
  INSERT INTO ledger_cells (owner, pinned, budget_month, account_id, category_id, type, cancelled, sign, sum_cents, n)
      VALUES (NEW.owner, CASE WHEN NEW.type = 'investment' OR NEW.plan_id IS NOT NULL OR NEW.flag_id IS NOT NULL
        OR NEW.settled_by IS NOT NULL OR NEW.report_count > 0 THEN 1 ELSE 0 END,
        NEW.budget_month, NEW.account_id, NEW.category_id, NEW.type, NEW.cancelled,
        CASE WHEN NEW.amount_cents > 0 THEN 1 WHEN NEW.amount_cents < 0 THEN -1 ELSE 0 END, NEW.amount_cents, 1)
      ON CONFLICT (owner, pinned, budget_month, account_id, category_id, type, cancelled, sign) DO UPDATE SET sum_cents = sum_cents + excluded.sum_cents, n = n + excluded.n;
  INSERT INTO ledger_months (owner, budget_month, n) VALUES (NEW.owner, NEW.budget_month, 1)
      ON CONFLICT (owner, budget_month) DO UPDATE SET n = n + excluded.n;
END;

CREATE TRIGGER IF NOT EXISTS ledger_rollup_ad AFTER DELETE ON transactions
BEGIN
  INSERT INTO ledger_cells (owner, pinned, budget_month, account_id, category_id, type, cancelled, sign, sum_cents, n)
      VALUES (OLD.owner, CASE WHEN OLD.type = 'investment' OR OLD.plan_id IS NOT NULL OR OLD.flag_id IS NOT NULL
        OR OLD.settled_by IS NOT NULL OR OLD.report_count > 0 THEN 1 ELSE 0 END,
        OLD.budget_month, OLD.account_id, OLD.category_id, OLD.type, OLD.cancelled,
        CASE WHEN OLD.amount_cents > 0 THEN 1 WHEN OLD.amount_cents < 0 THEN -1 ELSE 0 END, -OLD.amount_cents, -1)
      ON CONFLICT (owner, pinned, budget_month, account_id, category_id, type, cancelled, sign) DO UPDATE SET sum_cents = sum_cents + excluded.sum_cents, n = n + excluded.n;
  DELETE FROM ledger_cells
      WHERE owner = OLD.owner AND pinned = CASE WHEN OLD.type = 'investment' OR OLD.plan_id IS NOT NULL OR OLD.flag_id IS NOT NULL
        OR OLD.settled_by IS NOT NULL OR OLD.report_count > 0 THEN 1 ELSE 0 END
        AND budget_month = OLD.budget_month AND account_id = OLD.account_id AND category_id = OLD.category_id
        AND type = OLD.type AND cancelled = OLD.cancelled AND sign = CASE WHEN OLD.amount_cents > 0 THEN 1 WHEN OLD.amount_cents < 0 THEN -1 ELSE 0 END
        AND n = 0;
  INSERT INTO ledger_months (owner, budget_month, n) VALUES (OLD.owner, OLD.budget_month, -1)
      ON CONFLICT (owner, budget_month) DO UPDATE SET n = n + excluded.n;
  DELETE FROM ledger_months WHERE owner = OLD.owner AND budget_month = OLD.budget_month AND n = 0;
END;

CREATE TRIGGER IF NOT EXISTS ledger_rollup_au_cell
  AFTER UPDATE OF owner, budget_month, account_id, category_id, type, cancelled, amount_cents,
    plan_id, flag_id, settled_by, report_count ON transactions
  WHEN OLD.owner IS NOT NEW.owner OR OLD.budget_month IS NOT NEW.budget_month
    OR OLD.account_id IS NOT NEW.account_id OR OLD.category_id IS NOT NEW.category_id
    OR OLD.type IS NOT NEW.type OR OLD.cancelled IS NOT NEW.cancelled
    OR (CASE WHEN OLD.type = 'investment' OR OLD.plan_id IS NOT NULL OR OLD.flag_id IS NOT NULL
        OR OLD.settled_by IS NOT NULL OR OLD.report_count > 0 THEN 1 ELSE 0 END) <> (CASE WHEN NEW.type = 'investment' OR NEW.plan_id IS NOT NULL OR NEW.flag_id IS NOT NULL
        OR NEW.settled_by IS NOT NULL OR NEW.report_count > 0 THEN 1 ELSE 0 END)
    OR (CASE WHEN OLD.amount_cents > 0 THEN 1 WHEN OLD.amount_cents < 0 THEN -1 ELSE 0 END) <> (CASE WHEN NEW.amount_cents > 0 THEN 1 WHEN NEW.amount_cents < 0 THEN -1 ELSE 0 END)
BEGIN
  INSERT INTO ledger_cells (owner, pinned, budget_month, account_id, category_id, type, cancelled, sign, sum_cents, n)
      VALUES (OLD.owner, CASE WHEN OLD.type = 'investment' OR OLD.plan_id IS NOT NULL OR OLD.flag_id IS NOT NULL
        OR OLD.settled_by IS NOT NULL OR OLD.report_count > 0 THEN 1 ELSE 0 END,
        OLD.budget_month, OLD.account_id, OLD.category_id, OLD.type, OLD.cancelled,
        CASE WHEN OLD.amount_cents > 0 THEN 1 WHEN OLD.amount_cents < 0 THEN -1 ELSE 0 END, -OLD.amount_cents, -1)
      ON CONFLICT (owner, pinned, budget_month, account_id, category_id, type, cancelled, sign) DO UPDATE SET sum_cents = sum_cents + excluded.sum_cents, n = n + excluded.n;
  DELETE FROM ledger_cells
      WHERE owner = OLD.owner AND pinned = CASE WHEN OLD.type = 'investment' OR OLD.plan_id IS NOT NULL OR OLD.flag_id IS NOT NULL
        OR OLD.settled_by IS NOT NULL OR OLD.report_count > 0 THEN 1 ELSE 0 END
        AND budget_month = OLD.budget_month AND account_id = OLD.account_id AND category_id = OLD.category_id
        AND type = OLD.type AND cancelled = OLD.cancelled AND sign = CASE WHEN OLD.amount_cents > 0 THEN 1 WHEN OLD.amount_cents < 0 THEN -1 ELSE 0 END
        AND n = 0;
  INSERT INTO ledger_cells (owner, pinned, budget_month, account_id, category_id, type, cancelled, sign, sum_cents, n)
      VALUES (NEW.owner, CASE WHEN NEW.type = 'investment' OR NEW.plan_id IS NOT NULL OR NEW.flag_id IS NOT NULL
        OR NEW.settled_by IS NOT NULL OR NEW.report_count > 0 THEN 1 ELSE 0 END,
        NEW.budget_month, NEW.account_id, NEW.category_id, NEW.type, NEW.cancelled,
        CASE WHEN NEW.amount_cents > 0 THEN 1 WHEN NEW.amount_cents < 0 THEN -1 ELSE 0 END, NEW.amount_cents, 1)
      ON CONFLICT (owner, pinned, budget_month, account_id, category_id, type, cancelled, sign) DO UPDATE SET sum_cents = sum_cents + excluded.sum_cents, n = n + excluded.n;
END;

CREATE TRIGGER IF NOT EXISTS ledger_rollup_au_amount AFTER UPDATE OF amount_cents ON transactions
  WHEN OLD.amount_cents IS NOT NEW.amount_cents AND NOT (OLD.owner IS NOT NEW.owner OR OLD.budget_month IS NOT NEW.budget_month
    OR OLD.account_id IS NOT NEW.account_id OR OLD.category_id IS NOT NEW.category_id
    OR OLD.type IS NOT NEW.type OR OLD.cancelled IS NOT NEW.cancelled
    OR (CASE WHEN OLD.type = 'investment' OR OLD.plan_id IS NOT NULL OR OLD.flag_id IS NOT NULL
        OR OLD.settled_by IS NOT NULL OR OLD.report_count > 0 THEN 1 ELSE 0 END) <> (CASE WHEN NEW.type = 'investment' OR NEW.plan_id IS NOT NULL OR NEW.flag_id IS NOT NULL
        OR NEW.settled_by IS NOT NULL OR NEW.report_count > 0 THEN 1 ELSE 0 END)
    OR (CASE WHEN OLD.amount_cents > 0 THEN 1 WHEN OLD.amount_cents < 0 THEN -1 ELSE 0 END) <> (CASE WHEN NEW.amount_cents > 0 THEN 1 WHEN NEW.amount_cents < 0 THEN -1 ELSE 0 END))
BEGIN
  UPDATE ledger_cells SET sum_cents = sum_cents + NEW.amount_cents - OLD.amount_cents
      WHERE owner = NEW.owner AND pinned = CASE WHEN NEW.type = 'investment' OR NEW.plan_id IS NOT NULL OR NEW.flag_id IS NOT NULL
        OR NEW.settled_by IS NOT NULL OR NEW.report_count > 0 THEN 1 ELSE 0 END
        AND budget_month = NEW.budget_month AND account_id = NEW.account_id AND category_id = NEW.category_id
        AND type = NEW.type AND cancelled = NEW.cancelled AND sign = CASE WHEN NEW.amount_cents > 0 THEN 1 WHEN NEW.amount_cents < 0 THEN -1 ELSE 0 END;
END;

CREATE TRIGGER IF NOT EXISTS ledger_rollup_au_month AFTER UPDATE OF owner, budget_month ON transactions
  WHEN OLD.owner IS NOT NEW.owner OR OLD.budget_month IS NOT NEW.budget_month
BEGIN
  INSERT INTO ledger_months (owner, budget_month, n) VALUES (OLD.owner, OLD.budget_month, -1)
      ON CONFLICT (owner, budget_month) DO UPDATE SET n = n + excluded.n;
  DELETE FROM ledger_months WHERE owner = OLD.owner AND budget_month = OLD.budget_month AND n = 0;
  INSERT INTO ledger_months (owner, budget_month, n) VALUES (NEW.owner, NEW.budget_month, 1)
      ON CONFLICT (owner, budget_month) DO UPDATE SET n = n + excluded.n;
END;

INSERT OR REPLACE INTO ledger_cells (owner, pinned, budget_month, account_id, category_id, type, cancelled, sign, sum_cents, n)
  SELECT owner, pinned, budget_month, account_id, category_id, type, cancelled, sign, SUM(sum_cents), SUM(n) FROM (
    SELECT t.owner AS owner, CASE WHEN t.type = 'investment' OR t.plan_id IS NOT NULL OR t.flag_id IS NOT NULL
        OR t.settled_by IS NOT NULL OR t.report_count > 0 THEN 1 ELSE 0 END AS pinned,
        t.budget_month AS budget_month, t.account_id AS account_id, t.category_id AS category_id, t.type AS type,
        t.cancelled AS cancelled, CASE WHEN t.amount_cents > 0 THEN 1 WHEN t.amount_cents < 0 THEN -1 ELSE 0 END AS sign, t.amount_cents AS sum_cents, 1 AS n
      FROM transactions t
    UNION ALL
    SELECT owner, pinned, budget_month, account_id, category_id, type, cancelled, sign, 0, 0 FROM ledger_cells)
  GROUP BY 1, 2, 3, 4, 5, 6, 7, 8;

DELETE FROM ledger_cells WHERE n = 0;

INSERT OR REPLACE INTO ledger_months (owner, budget_month, n)
  SELECT owner, budget_month, SUM(n) FROM (
    SELECT owner, budget_month, 1 AS n FROM transactions
    UNION ALL
    SELECT owner, budget_month, 0 FROM ledger_months)
  GROUP BY owner, budget_month;

DELETE FROM ledger_months WHERE n = 0;

