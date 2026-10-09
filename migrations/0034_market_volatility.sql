-- How far a year's return strays from the typical one, for the spread card that replays the plan with
-- random returns: a fraction (0.15 is 15%), one value for the owner rather than one per plan, so every
-- scenario is replayed with the same market. Nullable and read as 15%, so there is nothing to backfill.
-- No owner-scoped statement here, so nothing to substitute before applying.
--
-- Apply this before the code that saves it is deployed: a database without the column still loads
-- settings (they read as 15%), but saving this one fails until the column is there.
--
-- Run as one batch:
--   npx wrangler d1 execute roy-expenses --remote --file=migrations/0034_market_volatility.sql

ALTER TABLE settings ADD COLUMN market_volatility REAL;
