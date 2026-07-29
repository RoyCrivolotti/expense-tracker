-- Per-owner net-worth milestones, replacing the hardcoded €100k-€1M list.
-- milestones is a JSON array of {label, amountCents} objects, ordered ascending.
-- label is a short optional name ('' renders as the formatted amount).
-- amountCents is a positive integer measured against the invested portfolio.
--
-- Nullable on purpose: NULL means "never customised" and falls back to the
-- built-in defaults, so existing owners keep today's €100k-€1M list with no
-- backfill. An empty array is a deliberate "no milestones" choice and is
-- distinct from NULL. No owner-scoped statement here, so nothing to substitute
-- before applying.
--
-- Run as one batch:
--   npx wrangler d1 execute roy-expenses --remote --file=migrations/0014_custom_milestones.sql

ALTER TABLE settings ADD COLUMN milestones TEXT;
