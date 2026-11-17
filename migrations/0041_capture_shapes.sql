-- What capture keeps of a push from now on: its shape, its slots and the template it belongs to, so the app can learn
-- a bank's wording from the person's own pushes instead of rules written for each bank.
--
-- The storage rule changes here, and 0040's header, which says a push keeps text only when it came out incomplete,
-- no longer holds. The cleaned body is kept on the event for a push that shows an amount with a currency marker,
-- whoever it names, and is blanked when its recommendation is decided or 30 days after it arrived, whichever comes
-- first. A push with no currency-marked amount keeps no text at all, which keeps one-time codes out without needing
-- to know what a code push says. A template keeps the push's words with every number masked, and once a sibling
-- push shows which words vary, those words are replaced by a wildcard.

-- The template's shape: a hash of the source and the masked words. The template is the person's row in
-- `capture_templates`, null when they already hold the most templates allowed and none can be evicted.
ALTER TABLE capture_events ADD COLUMN shape_id TEXT;
ALTER TABLE capture_events ADD COLUMN template_id TEXT;
-- The numbers, masked digits, dates and codes the reader found, as JSON. Capped, as every text column here is, so one
-- oversized push cannot make a large row.
ALTER TABLE capture_events ADD COLUMN slots TEXT CHECK (slots IS NULL OR length(slots) <= 2000);
-- What the person did with the recommendation, written when they decide. Empty until the app learns from decisions.
ALTER TABLE capture_events ADD COLUMN outcome TEXT;
-- The cleaned body under the rule above. `body_excerpt` is not renamed because the capture Worker is deployed by hand
-- after this migration runs, and the one running until then still writes that column. Nothing writes it once the new
-- Worker is out; what it holds is blanked on decide and at 30 days along with `body`, so a later migration can drop it.
ALTER TABLE capture_events ADD COLUMN body TEXT CHECK (body IS NULL OR length(body) <= 500);
-- Blanking the body of a decided recommendation finds its event by this.
CREATE INDEX IF NOT EXISTS idx_capture_events_rec ON capture_events (owner, rec_id);
-- The 30-day rule runs on every stored push. Only rows that still hold text are in this index, so it reads a month
-- of rows at most, not the person's whole history. `merchant_raw` is in it because a first push of a wording keeps
-- its whole body there too.
CREATE INDEX IF NOT EXISTS idx_capture_events_text ON capture_events (owner, received_at)
  WHERE body IS NOT NULL OR body_excerpt IS NOT NULL OR merchant_raw IS NOT NULL;

-- Pushes that were not `{ source, title, body, date }`, counted by day like the rest.
ALTER TABLE capture_counters ADD COLUMN malformed INTEGER NOT NULL DEFAULT 0;

-- One row per template a person's bank writes, learned from their own pushes and never shared between people.
-- `template_id` is made when the row is, and stays while `skeleton` is rewritten. `title` is the masked title, the
-- key sibling pushes are looked up by. `skeleton` is the masked text; once two pushes of one title differ in a
-- single run of words, that run becomes `<M>` and `merchant_start` and `merchant_end` say where it sits (in tokens,
-- end exclusive), so the template stops holding the merchant or the person the first push named. `seen` and the
-- dates count pushes. The decision counts, `amount_slot`, `amount_mark`, `type`, `account_id` and `ignored_at` are
-- learned from what the person does with the recommendations and stay at their defaults until that is built.
-- A person holds at most 500; at the cap the least recently seen template nobody has accepted goes first, and an
-- ignored one is never evicted, since evicting it would bring its pushes back.
CREATE TABLE IF NOT EXISTS capture_templates (
  owner TEXT NOT NULL,
  template_id TEXT NOT NULL,
  source TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(title) <= 1000),
  skeleton TEXT NOT NULL CHECK (length(skeleton) <= 1000),
  merchant_start INTEGER,
  merchant_end INTEGER,
  seen INTEGER NOT NULL DEFAULT 0,
  accepts INTEGER NOT NULL DEFAULT 0,
  dismissals INTEGER NOT NULL DEFAULT 0,
  dismiss_streak INTEGER NOT NULL DEFAULT 0,
  amount_slot INTEGER,
  amount_mark TEXT,
  type TEXT,
  account_id INTEGER,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  ignored_at TEXT,
  PRIMARY KEY (owner, template_id)
);
-- The templates a new push may belong to: same person, same app, same title, the most recently seen first. With
-- `last_seen` in it the read stops at the title's rows; without it the planner may walk all the person's templates
-- in `last_seen` order instead of sorting a few.
CREATE INDEX IF NOT EXISTS idx_capture_templates_lookup ON capture_templates (owner, source, title, last_seen);
-- The template to evict at the cap.
CREATE INDEX IF NOT EXISTS idx_capture_templates_seen ON capture_templates (owner, last_seen);
