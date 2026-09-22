-- The global "Goal inputs" card and the "Liquid net worth" setting are gone. Every
-- saved scenario carries its own house and return assumptions, and a plan's start
-- balance now comes from the latest wealth check-in, so nothing reads either any more.
--
-- Deploy with or after the code that stops reading them: the previous release still
-- selects from goal_inputs on every dataset load.
--
-- Run as one batch:
--   npx wrangler d1 execute roy-expenses --remote --file=migrations/0023_drop_goal_inputs.sql
DROP TABLE IF EXISTS goal_inputs;
ALTER TABLE settings DROP COLUMN liquid_net_worth_cents;
