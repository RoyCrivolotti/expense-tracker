-- Installment plans: optional day-of-month the payment is due. Enables the
-- Transactions cards to filter to "overdue or due within a day" rather than
-- showing everything predicted for the viewed budget month. Nullable: existing
-- plans stay NULL (legacy/unknown day) and are always shown when their month
-- matches, until the day is set from the plan form.
--
-- Run as one batch:
--   npx wrangler d1 execute roy-expenses --remote --file=migrations/0010_installment_due_day.sql

ALTER TABLE installment_plans ADD COLUMN due_day_of_month INTEGER;
