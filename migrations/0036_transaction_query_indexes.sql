-- Two indexes for the paged transaction list and its summary, which read a newest-first page with
-- LIMIT instead of loading every row. Neither query shape can be served by the indexes there are:
-- with only idx_txn_owner (owner), SQLite finds the owner's rows and then sorts all of them to
-- return fifty, so every page costs a read of the owner's whole ledger.
--
--   (owner, date)                 list and summary with no month: walks the owner's rows already in
--                                 date order (the row id breaks ties in the same direction, so
--                                 "ORDER BY date DESC, id DESC" needs no sort), and narrows a
--                                 dateFrom/dateTo range and the keyset position by key.
--   (owner, budget_month, date)   the same with a month chosen: a month's rows sit together and in
--                                 date order. Without it a past month is found by walking every
--                                 newer row first.
--
-- Each index costs one written row per inserted transaction (Cloudflare's Free plan allows 100,000
-- rows written a day), so docs/SCALING.md records the query plan that justifies each one and which
-- older indexes these make redundant. Nothing is dropped here.
--
-- No owner-scoped statement here, so nothing to substitute before applying. Applying it before or
-- after the code that reads through them changes only how many rows a page reads, not its result.
--
-- Applied by the deploy, which records it in _migrations (docs/DEPLOYMENT.md), or by hand with
--   npm run migrate -- <database> --apply

CREATE INDEX IF NOT EXISTS idx_txn_owner_date ON transactions (owner, date);
CREATE INDEX IF NOT EXISTS idx_txn_owner_month_date ON transactions (owner, budget_month, date);
