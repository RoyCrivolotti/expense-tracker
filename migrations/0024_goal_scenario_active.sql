-- One scenario per owner is "my plan": the one Progress, the dashboard badge and the
-- check-in deltas measure against. Until now that was whichever scenario the browser
-- last loaded into the editor, which the Goals tab then overwrote with the newest one
-- on every visit.
--
-- Run as one batch:
--   npx wrangler d1 execute roy-expenses --remote --file=migrations/0024_goal_scenario_active.sql
ALTER TABLE goal_scenarios ADD COLUMN is_active INTEGER NOT NULL DEFAULT 0;

-- Backfill each owner's newest scenario (highest sort_order, then id), which is what
-- the app was comparing against before, so nothing changes on deploy. Scoped to owners
-- with no plan yet: a re-run cannot move a plan the user has since chosen.
UPDATE goal_scenarios SET is_active = 1 WHERE id IN (
  SELECT g.id FROM goal_scenarios g
  WHERE NOT EXISTS (
    SELECT 1 FROM goal_scenarios a WHERE a.owner = g.owner AND a.is_active = 1
  )
  AND NOT EXISTS (
    SELECT 1 FROM goal_scenarios h
    WHERE h.owner = g.owner
      AND (h.sort_order > g.sort_order OR (h.sort_order = g.sort_order AND h.id > g.id))
  )
);

-- The invariant lives in the schema, so no code path, seed script or hand-run SQL can
-- leave an owner with two plans.
CREATE UNIQUE INDEX IF NOT EXISTS idx_goal_scenarios_one_active
  ON goal_scenarios (owner) WHERE is_active = 1;
