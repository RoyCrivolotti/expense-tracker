-- One movement often arrives as several pushes: a card payment and a balance alert of the same amount seconds later,
-- or a purchase and an offer to split it. From now on a push that matches an open recommendation of the same person
-- (the same amount and currency, within 2 minutes, from another wording) joins it instead of making a second one, so
-- a recommendation can have several events behind it.

-- 1 on an event that joined a recommendation an earlier push made, 0 on the event that made it. The status screen
-- counts joined pushes apart from suggestions, and a decision teaches the template of the push that made the
-- recommendation. Rows stored before this made their own recommendation, so 0 is true of them.
ALTER TABLE capture_events ADD COLUMN grouped INTEGER NOT NULL DEFAULT 0 CHECK (grouped IN (0, 1));

-- A new push looks for the open recommendation it may join by owner, state and amount, then by time.
CREATE INDEX IF NOT EXISTS idx_recommendations_movement ON recommendations (owner, state, amount_cents, occurred_at);
