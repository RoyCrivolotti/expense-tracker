-- Changes to the monthly amount a scenario invests, from a month on.
-- contribution_schedule is a JSON array of {from, monthlyCents} objects in date order: from the
-- first of the month `from` (YYYY-MM) the scenario invests `monthlyCents` a month, and before it
-- it is exactly as it was. For example [{"from":"2028-03","monthlyCents":250000}].
--
-- NOT NULL DEFAULT '[]', like life_events: every existing scenario reads as having no changes, so
-- there is nothing to backfill and no placeholder to substitute before applying.
--
-- Apply this before the code that saves a schedule is deployed: a database without the column
-- still loads scenarios (they read as having no changes), but creating or saving one fails until
-- the column is there.
--
-- Run as one batch:
--   npx wrangler d1 execute roy-expenses --remote --file=migrations/0031_contribution_schedule.sql

ALTER TABLE goal_scenarios ADD COLUMN contribution_schedule TEXT NOT NULL DEFAULT '[]';
