-- Multi-user (row-level tenancy). Every data row gains an `owner` column (the
-- lowercased Cloudflare Access email); the API scopes every read and write by
-- it. Existing rows are backfilled to Roy so his data stays his. New users get
-- an empty tracker (no seeding).
--
-- Run as one atomic batch:
--   npx wrangler d1 execute roy-expenses --remote --file=migrations/0003_multi_user.sql

-- 1) Tables that only need a new column + backfill.
ALTER TABLE categories ADD COLUMN owner TEXT NOT NULL DEFAULT '';
ALTER TABLE accounts ADD COLUMN owner TEXT NOT NULL DEFAULT '';
ALTER TABLE transactions ADD COLUMN owner TEXT NOT NULL DEFAULT '';

UPDATE categories SET owner = 'owner@example.com';
UPDATE accounts SET owner = 'owner@example.com';
UPDATE transactions SET owner = 'owner@example.com';

CREATE INDEX idx_txn_owner ON transactions (owner);

-- 2) account_statements: PK must include owner (rebuild).
CREATE TABLE account_statements_new (
  owner TEXT NOT NULL DEFAULT '',
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  year_month TEXT NOT NULL,
  paid INTEGER NOT NULL DEFAULT 0,
  paid_on TEXT,
  PRIMARY KEY (owner, account_id, year_month)
);
INSERT INTO account_statements_new (owner, account_id, year_month, paid, paid_on)
  SELECT 'owner@example.com', account_id, year_month, paid, paid_on
  FROM account_statements;
DROP TABLE account_statements;
ALTER TABLE account_statements_new RENAME TO account_statements;

-- 3) cash_actuals: PK must include owner (rebuild).
CREATE TABLE cash_actuals_new (
  owner TEXT NOT NULL DEFAULT '',
  year_month TEXT NOT NULL,
  actual_cash_cents INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (owner, year_month)
);
INSERT INTO cash_actuals_new (owner, year_month, actual_cash_cents, updated_at)
  SELECT 'owner@example.com', year_month, actual_cash_cents, updated_at
  FROM cash_actuals;
DROP TABLE cash_actuals;
ALTER TABLE cash_actuals_new RENAME TO cash_actuals;

-- 4) settings: drop the id = 1 singleton; one row per owner.
CREATE TABLE settings_new (
  owner TEXT PRIMARY KEY,
  opening_cash_cents INTEGER NOT NULL DEFAULT 0,
  opening_investment_cents INTEGER NOT NULL DEFAULT 0,
  liquid_net_worth_cents INTEGER NOT NULL DEFAULT 0
);
INSERT INTO settings_new (owner, opening_cash_cents, opening_investment_cents, liquid_net_worth_cents)
  SELECT 'owner@example.com', opening_cash_cents, opening_investment_cents, liquid_net_worth_cents
  FROM settings WHERE id = 1;
DROP TABLE settings;
ALTER TABLE settings_new RENAME TO settings;

-- 5) goal_inputs: drop the id = 1 singleton; one row per owner.
CREATE TABLE goal_inputs_new (
  owner TEXT PRIMARY KEY,
  house_price_cents INTEGER NOT NULL DEFAULT 0,
  down_payment_fraction REAL NOT NULL DEFAULT 0,
  mortgage_term_years REAL NOT NULL DEFAULT 0,
  mortgage_rate_annual REAL NOT NULL DEFAULT 0,
  long_term_target_cents INTEGER NOT NULL DEFAULT 0,
  horizon_years REAL NOT NULL DEFAULT 0,
  expected_real_return REAL NOT NULL DEFAULT 0
);
INSERT INTO goal_inputs_new (owner, house_price_cents, down_payment_fraction, mortgage_term_years, mortgage_rate_annual, long_term_target_cents, horizon_years, expected_real_return)
  SELECT 'owner@example.com', house_price_cents, down_payment_fraction, mortgage_term_years, mortgage_rate_annual, long_term_target_cents, horizon_years, expected_real_return
  FROM goal_inputs WHERE id = 1;
DROP TABLE goal_inputs;
ALTER TABLE goal_inputs_new RENAME TO goal_inputs;
