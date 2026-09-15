-- Records which migrations a database has already had, so they are never re-applied.
--
-- Re-running is destructive, not just noisy: 0003 continues past its first failing
-- statement into unscoped `UPDATE ... SET owner` and four DROP TABLE rebuilds, and
-- 0012 overwrites a user-editable plan_start_date. SQLite has no
-- `ADD COLUMN IF NOT EXISTS`, so the fix has to be not running the file at all.
--
-- Not seeded here: a new database must genuinely execute 0001-0019. Existing ones are
-- seeded by hand once — see "Migration tracking" in docs/DEPLOYMENT.md.
CREATE TABLE IF NOT EXISTS _migrations (
  name TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
