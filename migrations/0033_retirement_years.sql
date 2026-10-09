-- How many years the invested money has to pay for the spending after financial independence. The
-- drawdown chart ran 30 years (or the plan's horizon, if shorter) with that written into the code, and
-- the right withdrawal rate depends on how long the money must last. retirement_years is that number of
-- years, per scenario, whole, at least 1 and at most 100.
--
-- NOT NULL DEFAULT 30, so every existing scenario keeps the 30 years it was always drawn over and there
-- is nothing to backfill.
--
-- Apply this before the code that saves it is deployed: a database without the column still loads
-- scenarios (they read as 30 years), but creating or saving one fails until the column is there.
--
-- Run as one batch:
--   npx wrangler d1 execute roy-expenses --remote --file=migrations/0033_retirement_years.sql

ALTER TABLE goal_scenarios ADD COLUMN retirement_years INTEGER NOT NULL DEFAULT 30;
