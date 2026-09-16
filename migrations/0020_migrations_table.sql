-- Records which migrations a database has already had, so they are never re-applied.
--
-- Re-running is destructive, not just noisy: 0003 continues past its first failing
-- statement into four DROP TABLE rebuilds. Its backfill and 0012's are scoped now
-- (`WHERE owner = ''`, `WHERE plan_start_date IS NULL`), so those are a no-op on a
-- second run rather than a tenancy wipe and an overwritten plan_start_date; the
-- rebuilds are what remains dangerous and cannot be scoped away. SQLite has no
-- `ADD COLUMN IF NOT EXISTS`, so the fix has to be not running the file at all.
--
-- Not seeded here: a new database must genuinely execute 0001-0019. Existing ones are
-- seeded by hand once — see "Migration tracking" in docs/DEPLOYMENT.md.
CREATE TABLE IF NOT EXISTS _migrations (
  name TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
