-- Goal comparison scenarios (owner-scoped, persisted per user).

CREATE TABLE goal_scenarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  sort_order INTEGER NOT NULL DEFAULT 0,
  start_invested_cents INTEGER NOT NULL DEFAULT 0,
  monthly_contribution_cents INTEGER NOT NULL DEFAULT 0,
  annual_contribution_growth REAL NOT NULL DEFAULT 0,
  expected_real_return REAL NOT NULL DEFAULT 0.07,
  horizon_years REAL NOT NULL DEFAULT 30,
  house_price_cents INTEGER NOT NULL DEFAULT 0,
  down_payment_fraction REAL NOT NULL DEFAULT 0,
  house_purchase_year INTEGER,
  transaction_costs_cents INTEGER NOT NULL DEFAULT 0,
  mortgage_term_years REAL NOT NULL DEFAULT 0,
  mortgage_rate_annual REAL NOT NULL DEFAULT 0,
  house_appreciation_rate REAL NOT NULL DEFAULT 0.025,
  rent_monthly_cents INTEGER NOT NULL DEFAULT 0,
  annual_spend_cents INTEGER NOT NULL DEFAULT 0,
  safe_withdrawal_rate REAL NOT NULL DEFAULT 0.04,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_goal_scenarios_owner ON goal_scenarios (owner);
