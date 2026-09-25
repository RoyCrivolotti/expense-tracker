-- The inflation the Goals tab assumes wherever it meets a nominal figure: check-in balances
-- brought back to today's money before they are set against the plan, the house and the
-- mortgage brought back the same way, and the nominal view's inflated plan line. One value
-- for the owner rather than one per plan, so every scenario and the comparison table share
-- a basis. Nullable and read as 2%, so nothing to backfill. No owner-scoped statement here,
-- so nothing to substitute before applying.
--
-- Run as one batch:
--   npx wrangler d1 execute roy-expenses --remote --file=migrations/0027_assumed_inflation.sql

ALTER TABLE settings ADD COLUMN assumed_inflation REAL;
