-- The name printed on a reimbursement claim, so the document identifies who is
-- claiming. Without it the pack is an anonymous table of figures, which is not
-- something an employer will accept.
--
-- Nullable and read as '' — an owner who never sets it gets a claim sheet with
-- no claimant line rather than a blank label, and there is nothing to backfill.
-- Deliberately not the Cloudflare Access email: that identifies the account, not
-- the person, and 'someone@example.com' on an expense form reads as a mistake.
-- No owner-scoped statement here, so nothing to substitute before applying.
--
-- Run as one batch:
--   npx wrangler d1 execute roy-expenses --remote --file=migrations/0017_claimant_name.sql

ALTER TABLE settings ADD COLUMN claimant_name TEXT;
