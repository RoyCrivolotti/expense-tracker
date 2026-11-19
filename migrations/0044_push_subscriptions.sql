-- Web push for captured payments: where each device's subscription lives, and how each person wants to be told.
-- Nothing sends yet: applying this changes no response and no screen until the routes that write these tables ship.
--
-- Every row carries its owner. A subscription is what the browser hands the app after the person allows
-- notifications on that device: the push service's URL for the device and the two keys the payload is encrypted to
-- (RFC 8291). Those keys are the browser's own public material, not secrets, but a row still lets its holder send to
-- that device, so it is read only by its owner's routes and the capture Worker. There are no foreign keys.

-- One row per device. The endpoint is unique: a device that is saved again (a new sign-in, a refreshed
-- subscription) refreshes its row rather than adding one.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  label TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_sent_at TEXT,
  last_status INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint ON push_subscriptions (endpoint);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_owner ON push_subscriptions (owner);

-- One row per person: a push for every payment as it arrives, or a summary once a day or once a week at a set hour
-- in the person's own zone. `time_zone` is the zone name the browser reported when the choice was saved, so nothing
-- here names a country. `last_summary_at` lets an hourly job send each summary once.
CREATE TABLE IF NOT EXISTS push_settings (
  owner TEXT PRIMARY KEY,
  mode TEXT NOT NULL CHECK (mode IN ('each', 'daily', 'weekly')),
  time_zone TEXT NOT NULL,
  last_summary_at TEXT
);
