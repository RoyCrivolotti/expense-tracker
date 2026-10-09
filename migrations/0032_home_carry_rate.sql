-- What owning the house costs each year beyond the mortgage, as a share of its value: repairs, property
-- tax and building insurance. Rent vs buy counts it against the buyer, and until now used a rate of
-- 1,5% that was written into the code and not shown anywhere. home_carry_rate is that share as a
-- fraction (0.015 is 1,5% of the house's value a year), per scenario, between 0 and 0.1.
--
-- NOT NULL DEFAULT 0.015, so every existing scenario keeps the rate it was always compared with and
-- there is nothing to backfill.
--
-- Apply this before the code that saves it is deployed: a database without the column still loads
-- scenarios (they read as 1,5%), but creating or saving one fails until the column is there.
--
-- Applied by the deploy, which records it in _migrations (docs/DEPLOYMENT.md), or by hand with
--   npm run migrate -- <database> --apply
-- Running the file with wrangler on its own does not record it, and the next deploy then tries to add the column again.

ALTER TABLE goal_scenarios ADD COLUMN home_carry_rate REAL NOT NULL DEFAULT 0.015;
