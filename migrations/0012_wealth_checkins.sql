-- Wealth check-in system: named asset/liability accounts and periodic snapshots
-- of their market values, enabling actual-vs-plan tracking against goal scenarios.
--
-- Run as one batch:
--   npx wrangler d1 execute roy-expenses --remote --file=migrations/0012_wealth_checkins.sql

-- Named wealth accounts (investment portfolio, cash savings, other assets, debts).
-- Distinct from expense tracker accounts (debit/credit); these track net-worth
-- components by market value, not cash flow.
CREATE TABLE wealth_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('investment', 'cash', 'other_asset', 'debt')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_wealth_accounts_owner ON wealth_accounts (owner);

-- A check-in represents a single point-in-time snapshot of wealth.
-- Values per account are stored in wealth_checkin_entries.
CREATE TABLE wealth_checkins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner TEXT NOT NULL,
  checkin_date TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_wealth_checkins_owner ON wealth_checkins (owner);
CREATE INDEX idx_wealth_checkins_owner_date ON wealth_checkins (owner, checkin_date);

-- Per-account market value at the time of a check-in (positive for assets, positive
-- for debts — the sign is determined by the account's kind when computing net worth).
CREATE TABLE wealth_checkin_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  checkin_id INTEGER NOT NULL REFERENCES wealth_checkins (id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES wealth_accounts (id) ON DELETE CASCADE,
  value_cents INTEGER NOT NULL DEFAULT 0,
  UNIQUE (checkin_id, account_id)
);

CREATE INDEX idx_wealth_checkin_entries_checkin ON wealth_checkin_entries (checkin_id);
CREATE INDEX idx_wealth_checkin_entries_account ON wealth_checkin_entries (account_id);

-- Calendar anchor for scenarios: enables computing "plan value at today's date"
-- and therefore on/off-track deltas. Backfilled from created_at (best available
-- proxy); users can edit this per-scenario via the Goals UI.
ALTER TABLE goal_scenarios ADD COLUMN plan_start_date TEXT;
UPDATE goal_scenarios SET plan_start_date = date(created_at);
