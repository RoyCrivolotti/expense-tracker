-- Per-owner choice of the inputs the Goals page keeps in its bar.
-- goal_levers is a JSON array of up to five scenario input names, in the order they are shown, for
-- example ["monthlyContributionCents","expectedRealReturn"].
--
-- Nullable on purpose: NULL means "never chosen" and falls back to the built-in five, so existing
-- owners see the bar they would have had with no backfill. An empty array is a deliberate "no
-- levers" choice and is distinct from NULL. No owner-scoped statement here, so nothing to
-- substitute before applying.
--
-- Apply this before the code that saves the choice is deployed: a database without the column
-- still reads as the defaults, but saving a choice fails until the column is there.
--
-- Run as one batch:
--   npx wrangler d1 execute roy-expenses --remote --file=migrations/0030_goal_levers.sql

ALTER TABLE settings ADD COLUMN goal_levers TEXT;
