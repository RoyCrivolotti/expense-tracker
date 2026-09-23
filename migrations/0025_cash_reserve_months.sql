-- The emergency-fund target: how many months of spending to hold in cash accounts.
-- Progress sets the cash balance from the latest check-in against it. Nullable and read
-- as 0, which means no target, so nothing to backfill. No owner-scoped statement here, so
-- nothing to substitute before applying.
--
-- Run as one batch:
--   npx wrangler d1 execute roy-expenses --remote --file=migrations/0025_cash_reserve_months.sql

ALTER TABLE settings ADD COLUMN cash_reserve_months INTEGER;
