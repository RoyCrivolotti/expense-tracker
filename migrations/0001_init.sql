-- Expense tracker schema (Cloudflare D1 / SQLite).
-- Status (posted/forecast) is NEVER stored: it is derived from the account's
-- settlement type and the matching account_statements.paid flag. Only the
-- explicit `cancelled` flag is persisted on a transaction.

CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  monthly_budget_cents INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  icon TEXT,
  color TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE accounts (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('debit', 'credit')),
  -- immediate = cash leaves on entry (debit); deferred = posts when the
  -- statement for the budget month is paid (credit/charge cards).
  settlement TEXT NOT NULL CHECK (settlement IN ('immediate', 'deferred')),
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  budget_month TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  category_id INTEGER NOT NULL REFERENCES categories(id),
  type TEXT NOT NULL CHECK (type IN ('expense', 'income', 'investment', 'refund')),
  amount_cents INTEGER NOT NULL,
  cancelled INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_txn_budget_month ON transactions (budget_month);
CREATE INDEX idx_txn_account ON transactions (account_id);
CREATE INDEX idx_txn_category ON transactions (category_id);

CREATE TABLE account_statements (
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  year_month TEXT NOT NULL,
  paid INTEGER NOT NULL DEFAULT 0,
  paid_on TEXT,
  PRIMARY KEY (account_id, year_month)
);

CREATE TABLE settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  opening_cash_cents INTEGER NOT NULL DEFAULT 0,
  opening_investment_cents INTEGER NOT NULL DEFAULT 0,
  liquid_net_worth_cents INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE goal_inputs (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  house_price_cents INTEGER NOT NULL DEFAULT 0,
  down_payment_fraction REAL NOT NULL DEFAULT 0,
  mortgage_term_years REAL NOT NULL DEFAULT 0,
  mortgage_rate_annual REAL NOT NULL DEFAULT 0,
  long_term_target_cents INTEGER NOT NULL DEFAULT 0,
  horizon_years REAL NOT NULL DEFAULT 0,
  expected_real_return REAL NOT NULL DEFAULT 0
);

INSERT INTO settings (id) VALUES (1);
INSERT INTO goal_inputs (id) VALUES (1);
