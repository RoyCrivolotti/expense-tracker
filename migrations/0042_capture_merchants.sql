-- What a person calls each merchant their bank pushes name, learned from the payments they add, so a later push from
-- the same merchant can arrive with their own description, category, type and account instead of the bank's words.
--
-- One row per merchant, per amount and per description the person gave it, never shared between people. The merchant
-- is its key alone: the bank's name for it with accents and case folded and the words that hold a digit dropped (store
-- and terminal numbers). No push's body is ever kept here, and a key is only written from a recommendation whose text
-- is the merchant the template found, not a whole push. The rest is the person's own: the description as they typed
-- it, and ids of their category and account.
--
-- `amount_cents` is -1 on the row that counts every payment to the merchant, and the payment's cents on the row for
-- that price, since one merchant's text can stand for several things at fixed prices (one subscription at 2,99 and
-- another at 9,99). -1 rather than null because a null in the primary key never conflicts, so a second vote would
-- insert a second row instead of counting. `votes` counts the payments added with that description; the description
-- with the most is the suggestion. A person holds at most 2,000 rows, and the least recently seen make room.
CREATE TABLE IF NOT EXISTS capture_merchants (
  owner TEXT NOT NULL,
  key TEXT NOT NULL CHECK (length(key) BETWEEN 1 AND 80),
  amount_cents INTEGER NOT NULL CHECK (amount_cents = -1 OR amount_cents > 0),
  description TEXT NOT NULL CHECK (length(description) BETWEEN 1 AND 200),
  category_id INTEGER,
  type TEXT,
  account_id INTEGER,
  votes INTEGER NOT NULL DEFAULT 0,
  last_seen TEXT NOT NULL,
  PRIMARY KEY (owner, key, amount_cents, description)
);
-- The list reads a page's merchants by owner and key, which the primary key's own index already serves, so there is no
-- second index for it. This one finds the rows to evict at the cap.
CREATE INDEX IF NOT EXISTS idx_capture_merchants_seen ON capture_merchants (owner, last_seen);
