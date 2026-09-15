-- Records what a reimbursement covered at the moment it was recorded.
--
-- A past expense report is rebuilt from the rows still pointing at its payment, so
-- editing or deleting one of those rows afterwards silently rewrites the record of
-- what was submitted. These two columns are the only fixed point: they are written by
-- the settle itself, so the app can say "this no longer matches what you sent"
-- instead of quietly showing different numbers.
--
-- Both are NULL on every row that is not a reimbursement payment, and on payments
-- recorded before this migration — a report with no snapshot simply cannot be checked,
-- which is the truthful answer for one.
--
-- Run as one batch:
--   npx wrangler d1 execute roy-expenses --remote --file=migrations/0021_report_snapshot.sql

ALTER TABLE transactions ADD COLUMN report_count INTEGER;
ALTER TABLE transactions ADD COLUMN report_covered_cents INTEGER;
