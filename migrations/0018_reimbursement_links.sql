-- Links a claimed expense to the reimbursement that paid it back.
--
-- settled_by holds the id of the `refund` transaction covering this row. It is
-- set when a reimbursement is recorded and cleared if that reimbursement is
-- deleted, so the link is reversible and the rows return to the Flagged card.
--
-- Deliberately *not* a clearing of flag_id. Unflagging on settlement would empty
-- the card just as well, but it throws away which transactions were in which
-- claim — exactly the thing this column exists to record — and it cannot be
-- undone, since nothing would remember the flag. Keeping the flag and marking
-- the row settled does both: groupTransactionsByFlag skips settled rows, so the
-- card empties, and the history survives.
--
-- A reimbursement covers the rows the user selected, not every flagged row: five
-- transactions on one flag can span two trips, and an employer may approve some
-- lines and reject others. A rejected line simply stays flagged.
--
-- No enforced FK: D1's ALTER TABLE cannot add one, as with flag_id in 0015 and
-- plan_id in 0009. Integrity is enforced in app code.
--
-- Run as one batch:
--   npx wrangler d1 execute roy-expenses --remote --file=migrations/0018_reimbursement_links.sql

ALTER TABLE transactions ADD COLUMN settled_by INTEGER;
CREATE INDEX idx_txn_settled_by ON transactions (owner, settled_by) WHERE settled_by IS NOT NULL;
