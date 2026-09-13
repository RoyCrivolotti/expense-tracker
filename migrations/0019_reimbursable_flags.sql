-- Marks a flag as one where somebody owes you the money back.
--
-- Flags are generic markers: "Work travel" is money an employer will repay,
-- "Tax deductible" is a note for your accountant that nobody is going to pay.
-- Only the first kind should offer an expense report and a Record reimbursement
-- action — on the second they produce a document headed EXPENSE REPORT with a
-- signature line, addressed to nobody, for money that is not coming.
--
-- Defaults to 1 rather than 0: the existing flags were created when flagging
-- *was* reimbursement, so every one of them is reimbursable, and defaulting to
-- 0 would silently take the buttons away from a feature already in use.
--
-- Run as one batch:
--   npx wrangler d1 execute roy-expenses --remote --file=migrations/0019_reimbursable_flags.sql

ALTER TABLE flags ADD COLUMN reimbursable INTEGER NOT NULL DEFAULT 1;
