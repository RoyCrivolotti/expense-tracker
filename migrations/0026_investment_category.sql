-- The category every investment transaction is filed under, in both directions (money
-- into the portfolio and a withdrawal out of it), so the form can lock it rather than let
-- each row pick one. Nullable: with no choice the form falls back to a category named
-- like "Investments" if there is one, and otherwise leaves the picker free. No owner-scoped
-- statement here, so nothing to substitute before applying.
--
-- Run as one batch:
--   npx wrangler d1 execute roy-expenses --remote --file=migrations/0026_investment_category.sql

ALTER TABLE settings ADD COLUMN investment_category_id INTEGER;
