-- Per-user default payment account for new transactions.
ALTER TABLE settings ADD COLUMN default_account_id INTEGER;
