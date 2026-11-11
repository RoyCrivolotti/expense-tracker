-- Tables for turning a bank's push notifications into recommendations the user edits and submits.
-- Nothing reads or writes them yet: applying this changes no response and no screen.
--
-- Every row carries its owner. A recommendation is never an expense; it becomes one only through the
-- ordinary create path, when the user submits it. No table holds anything from a notification the app does
-- not recognise (those only add to a counter), and the two kinds whose text names another person never
-- store that text. There are no foreign keys: an account or a transaction deleted later leaves a number
-- that reads as "not mapped" or "already gone", which the reader derives, and must not block those deletes.

-- Keys that let a phone's Shortcuts automation send pushes. Only a hash of the secret half is kept, and
-- the list and export routes never return it. A key is revoked, never deleted, so its history stays honest.
CREATE TABLE IF NOT EXISTS capture_keys (
  key_id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  label TEXT NOT NULL,
  secret_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_capture_keys_owner ON capture_keys (owner);

-- Maps the digits a push shows to one of the owner's accounts: a card's last four, or an account's last digits.
CREATE TABLE IF NOT EXISTS capture_cards (
  owner TEXT NOT NULL,
  source TEXT NOT NULL,
  digits_kind TEXT NOT NULL,
  digits TEXT NOT NULL,
  account_id INTEGER NOT NULL,
  PRIMARY KEY (owner, source, digits_kind, digits)
);

-- One row per recognised push. `kind` is the app's own fixed list, never the bank's title. `amount_cents` is
-- signed (outflows negative) so a balance alert can be paired on its sign. `merchant_raw` and `body_excerpt`
-- stay empty for kinds whose text names a person. `merchant_raw` is capped at 200 characters and `body_excerpt` at
-- 500, so one hostile or oversized push cannot make a large row. `body_excerpt` is kept only for a recognised push
-- that came out incomplete, and is blanked once the user decides. `replay_key` holds whatever the writer
-- passes, which must be a keyed hash (HMAC) of the push and not a bare digest: a bare digest of a guessable
-- body can be matched. Posting the same push twice stores it once.
CREATE TABLE IF NOT EXISTS capture_events (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  key_id TEXT NOT NULL,
  source TEXT NOT NULL,
  replay_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  amount_cents INTEGER,
  currency TEXT,
  merchant_raw TEXT CHECK (merchant_raw IS NULL OR length(merchant_raw) <= 200),
  last4 TEXT,
  account_digits TEXT,
  occurred_at TEXT NOT NULL,
  local_date TEXT NOT NULL,
  offset_minutes INTEGER NOT NULL,
  received_at TEXT NOT NULL,
  rec_id TEXT,
  body_excerpt TEXT CHECK (body_excerpt IS NULL OR length(body_excerpt) <= 500)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_capture_events_replay ON capture_events (owner, source, replay_key);
-- The rate limit per key.
CREATE INDEX IF NOT EXISTS idx_capture_events_key ON capture_events (key_id, received_at);
-- The time of the last capture per source.
CREATE INDEX IF NOT EXISTS idx_capture_events_source ON capture_events (owner, source, received_at);

-- What was dropped, as a number and nothing else: one row per owner, source and UTC day.
CREATE TABLE IF NOT EXISTS capture_counters (
  owner TEXT NOT NULL,
  source TEXT NOT NULL,
  day TEXT NOT NULL,
  received INTEGER NOT NULL DEFAULT 0,
  unrecognised INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (owner, source, day)
);

-- What the user is asked to confirm. `amount_cents` is positive, as every type but an investment withdrawal is
-- stored. `suggested_type` is a default the user changes on the form, and null where the user must pick.
-- `state` is open, submitted or dismissed, checked in code; incomplete, late and the rest are derived on read.
CREATE TABLE IF NOT EXISTS recommendations (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  account_id INTEGER,
  amount_cents INTEGER,
  currency TEXT,
  occurred_at TEXT NOT NULL,
  local_date TEXT NOT NULL,
  merchant_raw TEXT CHECK (merchant_raw IS NULL OR length(merchant_raw) <= 200),
  description_suggested TEXT CHECK (description_suggested IS NULL OR length(description_suggested) <= 200),
  suggested_type TEXT,
  state TEXT NOT NULL DEFAULT 'open',
  txn_id INTEGER,
  created_at TEXT NOT NULL,
  decided_at TEXT
);
-- The id is last so a page of the open list in its order is read from the index with no sort.
CREATE INDEX IF NOT EXISTS idx_recommendations_open ON recommendations (owner, state, local_date, id);
-- A transaction answers for at most one recommendation.
CREATE UNIQUE INDEX IF NOT EXISTS idx_recommendations_txn ON recommendations (owner, txn_id) WHERE txn_id IS NOT NULL;
