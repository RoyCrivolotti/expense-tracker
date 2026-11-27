-- Whether the bank wrote a minus on a push's amount: 1 for `-12,50`, 0 for `+12,50` or no sign at all. Amounts are
-- stored without a sign, so this is the only way a stored push says money went out. Two pushes join one
-- recommendation only when both have a minus or neither does, so money sent and the same amount received a minute
-- later stay two payments.
--
-- Nullable on purpose. Pushes stored before this have NULL and never stop a new push joining, so nothing already
-- grouped changes and no row needs a backfill. No owner-scoped statement here, so nothing to substitute.
--
-- Apply this before the capture Worker that writes it is deployed; the Deploy workflow does both, in that order.
--
-- Run as one batch:
--   npx wrangler d1 execute roy-expenses --remote --file=migrations/0046_capture_amount_minus.sql

ALTER TABLE capture_events ADD COLUMN amount_minus INTEGER CHECK (amount_minus IS NULL OR amount_minus IN (0, 1));
