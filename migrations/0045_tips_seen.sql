-- Per-owner memory of which first-visit tips a person has dismissed, so a tip put away on the phone stays away on
-- the laptop. tips_seen is a JSON array of tip ids, for example ["getting-started"].
--
-- Nullable on purpose, and the three states matter. NULL means setup never wrote a list for this person: the app
-- treats such an account as established when it already has transactions (every tip counts as seen) and as new when
-- it has none. An empty array means "new person, nothing seen yet", which finishing or skipping setup and "Show the
-- tips again" write. So existing owners need no backfill and see nothing new. No owner-scoped statement here, so
-- nothing to substitute before applying.
--
-- Apply this before the code that saves a dismissal is deployed: a database without the column still reads as
-- never written, but saving a dismissal fails until the column is there.
--
-- Run as one batch:
--   npx wrangler d1 execute roy-expenses --remote --file=migrations/0045_tips_seen.sql

ALTER TABLE settings ADD COLUMN tips_seen TEXT;
