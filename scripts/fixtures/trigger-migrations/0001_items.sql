-- Test fixture for the migration tooling (scripts/migrationTriggerChain.test.ts). Not a migration of
-- this app: nothing applies this directory to a database. A table, the totals a trigger will keep
-- up to date, and an index.

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  cents INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS item_totals (
  kind TEXT PRIMARY KEY,
  n INTEGER NOT NULL,
  cents INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_items_kind ON items (kind);
