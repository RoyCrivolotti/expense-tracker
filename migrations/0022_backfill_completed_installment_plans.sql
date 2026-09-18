-- Closes out installment plans that are already fully paid but were never
-- marked complete, now that a transaction reaching the final installment
-- does this automatically going forward. Idempotent: running it again finds
-- nothing left to update.
--
-- Run as one batch:
--   npx wrangler d1 execute roy-expenses --remote --file=migrations/0022_backfill_completed_installment_plans.sql

UPDATE installment_plans
SET active = 0, updated_at = datetime('now')
WHERE active = 1
  AND id IN (
    SELECT plan_id FROM transactions
    WHERE plan_id IS NOT NULL AND cancelled = 0
    GROUP BY plan_id
    HAVING MAX(installment_index) >= (
      SELECT total_count FROM installment_plans WHERE id = transactions.plan_id
    )
  );
