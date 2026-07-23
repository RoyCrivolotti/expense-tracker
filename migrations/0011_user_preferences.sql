-- Per-user display and budget-period preferences, so the tracker is not tied to
-- one owner's euros-and-13th conventions. All three are nullable; NULL means the
-- app falls back to its built-in defaults (EUR, de-DE grouping, rollover day 1 =
-- plain calendar months). The primary owner keeps the historical 13th rollover
-- via the explicit UPDATE below.
--
-- Run as one batch:
--   npx wrangler d1 execute roy-expenses --remote --file=migrations/0011_user_preferences.sql

ALTER TABLE settings ADD COLUMN currency_code TEXT;
ALTER TABLE settings ADD COLUMN number_locale TEXT;
ALTER TABLE settings ADD COLUMN budget_rollover_day INTEGER;

-- Primary owner has always used a mid-month rollover (day 13). Replace the
-- placeholder email with the real Access email when applying to production.
UPDATE settings SET budget_rollover_day = 13 WHERE owner = 'owner@example.com';
