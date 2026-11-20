# Web push

For a contributor changing how the app tells a phone that a captured payment is waiting. It covers what a device's
subscription is, where it and the person's choice are kept, the routes, the Settings card that turns a device on, and
how the capture Worker sends one, and what the service worker does with a push and a tap. The payments themselves are in [CAPTURE.md](CAPTURE.md), and the
card that reviews them in [CAPTURE-REVIEW.md](CAPTURE-REVIEW.md).

## What a subscription is

When a person allows notifications on a device, the browser hands the app a subscription: the push service's URL for
that device (the endpoint) and two keys, the device's P-256 public key and a 16-byte auth secret. A sender encrypts
each message to those keys (RFC 8291), so the push service relays bytes it cannot read, and signs its request with the
deployment's VAPID key pair (RFC 8292), whose public half the browser was given at subscribe time. On an iPhone or iPad
only a web app added to the Home Screen can subscribe, the permission must be asked from a tap, and the push service is
Apple's.

The keys are the browser's own public material, not secrets, but a stored row still lets its holder send to that
device, so the table is read only by its owner's routes and by the sender, and the list route never returns the
endpoint or the keys.

## What is stored

[Migration 0044](../migrations/0044_push_subscriptions.sql). Every row carries its owner; there are no foreign keys.

- **`push_subscriptions`**, one row per device: id, owner, endpoint, the two keys, a label the device gave itself
  ("iPhone"), when it was saved, and the last send's time and the push service's status. The endpoint is kept as the sender will
  address it (the URL parser's spelling) and is unique, so a device saved again (a new sign-in, a refreshed subscription)
  refreshes its row, keeps its id and forgets the last status, and a device another person signs in on becomes theirs:
  holding the endpoint is the proof of holding the device. A person holds at most 10 devices, checked inside the
  insert; a refresh never counts against it.
- **`push_settings`**, one row per person: `mode` (`each`: a push per payment as it arrives; `daily` or `weekly`: one
  summary at a set hour), the `time_zone` the browser reported when the choice was saved (a name `Intl` accepts, which is what browsers
  report), and when the last summary went out. A person's first device writes the default, `daily` in that device's zone; a later device leaves a choice
  alone. Nothing in code names a country: the zone is whatever the browser says.

## Routes

All behind the sign-in and the signed-in person's own. These writes leave the dataset revision alone
([`_middleware.ts`](../functions/api/_middleware.ts)), since no ledger reader sees them.

| Route | Answers |
| --- | --- |
| `GET /api/push-config` | `{ publicKey }`: the `VAPID_PUBLIC_KEY` Pages variable when it is a base64url P-256 point (87 characters), else `null`, which the Settings card reads as "not set up" |
| `GET /api/push-subscriptions` | `{ devices: [{ id, label, createdAt, lastSentAt, lastStatus }], settings: { mode, timeZone } }`, newest device first; `settings` is `null` before any choice |
| `PUT /api/push-subscriptions` | `{ id }`. Body (at most 2 KB): `{ endpoint, keys: { p256dh, auth }, label, timeZone }`, what `PushSubscription.toJSON()` gives plus the device's name (at most 40 characters, no control characters, "Device" when blank) and the browser's zone. The endpoint must be `https` on a known push service host (Apple, Google, Mozilla, Microsoft) on the default port; `p256dh` an uncompressed P-256 point and `auth` 16 bytes, both base64url; `timeZone` a name `Intl` accepts. Anything else is a 400 and nothing is stored. 409 at 10 devices |
| `DELETE /api/push-subscriptions/:id` | `{ ok: true }`, or 404 for another person's device or an id that is none |
| `PUT /api/push-settings` | `{ ok: true }`. Body: `{ mode, timeZone }` with `mode` one of `each`, `daily`, `weekly`; 400 otherwise |

The host rule exists because the sender POSTs to whatever endpoint is stored: a closed list keeps it from ever being
pointed at an address that is not a push service.

## Turning a device on

Settings, Capture, "Notifications" ([`PushSetting.tsx`](../src/ui/settings/PushSetting.tsx), its own lazy chunk in the
capture bundle budget). Each device is turned on from that device, and the card says where this one stands:

- **Not installed** (an iPhone or iPad outside the Home Screen app, read from `navigator.standalone`): add the app to the
  Home Screen first. Nothing is read from the server.
- **Unsupported** (no Push API): turn it on from the phone.
- **Not set up** (`GET /api/push-config` has no key): the deployment has no VAPID pair yet.
- **Denied** (`Notification.permission`): iOS never asks twice, so the card points at the device's Settings.
- **Off**: "Turn on for this device" asks the permission and subscribes in the same tap, as iOS requires, and saves the
  subscription with the device's name (`src/config/device.ts`) and the browser's zone. The row's id is kept in the
  browser under the person's own key (`expense:push-device:<owner>`), so the card knows which device is this one.
- **On**: every device with its name, when it was saved, when something was last sent and whether it was delivered, this
  one marked; "Turn off" unsubscribes this device and forgets its row, or forgets another device's row; and the choice,
  three radio rows with the zone under them. Turning a device on does not choose "For every payment": a person's first
  device saves the default, the daily summary at 20:00, so nothing arrives per payment until they pick that row. A line
  under the rows says what the chosen mode gives and, for the summaries, where to ask for every payment.

When the card opens holding a subscription the server does not know: with no row remembered in the browser (a fresh
sign-in, cleared storage) it is saved; with a remembered row that is gone it was turned off from another device, so the
browser lets the subscription go rather than bring it back, and the person turns it on again from there if they want it.
A browser with no service worker that becomes ready within five seconds (a dev server, a failed registration) reads as
unsupported.

## What the service worker does

[`src/sw/push.ts`](../src/sw/push.ts), pure, wired in `sw.ts`. The sender encrypts a small JSON payload:
`{ v: 1, kind: "payment", id, url, amountCents, currency, merchant, open }` for one payment, or
`{ v: 1, kind: "summary", url, count, totalCents, currency, open }` for a daily or weekly summary.

- **Every push shows a notification**, whatever it holds: a push that shows nothing costs the web app its permission
  on iOS. A payment reads "Payment to review" with the amount written the device's way and the merchant, or "New
  payment" when the wording has no merchant yet; a summary reads "Payments to review" with the count and, when every
  open payment is in one currency, the total; a payload that cannot be read says "Tap to see it". The tag is the
  recommendation id (or `review-summary`), so a device that was off gets one notification per payment, not one per
  retry. `open` goes on the app icon's badge where the device has one.
- **Open windows are told.** After the notification is shown, every open window of the app gets one message,
  `{ type: "review-changed" }`, and the app reads the payments to review again ([CAPTURE-REVIEW.md](CAPTURE-REVIEW.md),
  "Keeping the list current"). The message carries no data and is sent for a push that could not be read too. It is
  never allowed to fail the push: a window that cannot be reached reads the list when it returns to the foreground.
- **A tap** opens the payload's URL inside the app and never another origin: an open window of the app is brought
  forward and sent there, else one is opened. The URL is `/?review=<id>`; the review card, which mounts once there is
  something to review, opens that payment's form as "Review" would, once, and takes the id off the URL. A payment no
  longer waiting opens nothing, and the card is there. A summary's URL is `/`. The tap itself needs no message: navigating the window reloads the page, which reads the list.

## How the capture Worker sends one

[`notify.ts`](../workers/capture/src/notify.ts) and [`webpush.ts`](../workers/capture/src/webpush.ts), on WebCrypto
alone. When a push from the phone makes a recommendation of its own and its person chose `each`, the Worker answers the
phone first and then, inside `ctx.waitUntil`, sends one message to each of the person's devices. A push that joins an
open recommendation, a replay, and a person on `daily` or `weekly` send nothing, and neither does a Worker without its
keys: it captures exactly as before.

- **Message.** The payload above, encrypted to the device's keys with a fresh salt and sender key each time (RFC 8291,
  `aes128gcm`), POSTed to the stored endpoint. The test reproduces the RFC's Appendix A message byte for byte, and
  decrypts what the Worker sends the way a browser does. The merchant is in the payload only when the template knows
  where it sits in the wording, so the whole bank text never goes.
- **Headers.** `TTL: 86400`, `Urgency: high`, `Topic` the recommendation id without its dashes (32 characters, so a
  device that was off gets one notification per payment), `Content-Encoding: aes128gcm`, and
  `Authorization: vapid t=<jwt>, k=<public key>`. The JWT (ES256, RFC 8292) is minted per push service and reused for an
  hour, as Apple asks.
- **Answers.** 2xx is recorded on the device row (`last_sent_at`, `last_status`, which Settings shows). 404 and 410 mean
  the push service no longer knows the device, so its row is deleted. Anything else, or a failed request, is logged and
  not retried: the next payment is the retry. A push service that has not answered in 10 seconds is given up on and
  logged as `timeout`, so a slow one cannot hold the Worker's background task until the platform ends it.
- **Log.** One `event: 'push'` line per device, or one for the reason nothing was sent: `outcome` (`sent`, `gone`,
  `failed`, `skipped`), `reason` (`ok`, `expired`, `push-service-error`, `network`, `timeout`, `not-configured`, `no-devices`,
  `summary-mode`, `nothing-waiting`, `invalid-zone`, `already-sent`, `exception`), `status`, `devices` and `ms`. Never the endpoint, a key, the owner or any payment text.
- **A send never fails the capture.** It runs after the response is decided and catches everything.

## Daily and weekly summaries

[`summaries.ts`](../workers/capture/src/summaries.ts) and [`summaryDue.ts`](../workers/capture/src/summaryDue.ts), run by
the capture Worker's hourly cron (`[triggers]` in `wrangler.toml`, `scheduled` in `index.ts`). Cloudflare's cron is in
UTC and knows nothing of a person's evening or of summer time, so every run asks each person with a summary mode what
time it is in their stored zone, which the platform's own `Intl` rules answer.

- **Due.** From 20:00 local to midnight, every day for `daily` and on Monday for `weekly`, until a summary is recorded
  for that local date. A run an hour or three late still sends that evening, two runs in one evening send once, and a
  run after midnight sends nothing for the evening it missed. A zone on a half hour (India) is reached at 20:30, the
  first hourly run past 20:00. A zone the platform does not know, or a blank one, is logged as `invalid-zone` and left
  alone.
- **Once.** Before sending, the run claims the person's evening with one statement,
  `UPDATE push_settings SET last_summary_at = ? WHERE owner = ? AND last_summary_at IS <the value it read>`, so of two
  runs at once only one gets a changed row and sends; the other logs `already-sent`. The send is not retried if it then
  fails: the next evening is the retry, as the next payment is for a push per payment.
- **Nothing is sent, and nothing is claimed,** when the person has nothing open (`nothing-waiting`) or no device
  (`no-devices`), so iOS never sees a push with nothing to show, and a payment that arrives later the same evening
  still gets its summary.
- **Message.** `{ v: 1, kind: "summary", url, count, totalCents, currency, open }`. The total is there only when every
  open payment has an amount and they share one currency; otherwise the notification gives the count alone. `url` is
  `/` for several payments and `/?review=<id>` for exactly one, so a tap opens its form as for a push per payment.
  Headers are the same as for one payment except `Topic: review-summary`, so a phone that was off for days gets the
  latest summary only.
- **Log.** The same `event: 'push'` line per device, plus one line per person who was skipped and why. With no VAPID
  secrets the cron logs `not-configured` once for the run, not once per person. A failure for one person or device
  stops no one else, and a 404 or 410 deletes that device's row.

Deploying the Worker puts the trigger live (the "Setting it up" steps below); `wrangler deploy` reads it from
`wrangler.toml`. Until then no summary is sent and a person on `daily`, the default, hears nothing at all.

## Setting it up

Everything below changes Cloudflare and needs the account owner's say-so. Do staging first, then production, and
check one real payment on staging before production. Staging and production each get their own key pair: a saved
subscription is bound to the public key it was made with, so devices are never shared between them anyway, and a leaked
staging private key then cannot sign for production.

1. Generate a key pair on your own machine. It prints two lines and sets nothing:

   ```bash
   node scripts/vapid-keys.mjs
   ```

2. Deploy the capture Worker version that sends. CI deploys the Pages app but never this Worker, so a merge to `main`
   does not put the sender live: someone deploys it from `main` (or from a merged commit), by hand. The deploy needs
   `account_id` and `database_id` filled into `workers/capture/wrangler.toml` on your machine; restore the file
   afterwards (`git checkout workers/capture/wrangler.toml`) and never commit them. From `workers/capture`:

   ```bash
   npx wrangler deploy --name <staging-worker>
   ```

   This step, and the secrets in the next one, are repeated for each environment, staging first, and each time with that
   environment's own key pair, its own Worker name and its own database name and id filled into `wrangler.toml`.
   Deploying production with staging's values in the file would point the production Worker at the staging database.

   A deploy made from a feature branch only makes a preview of the app's pages, so the live staging site shows a change
   once its branch is merged into `main` and deployed from there.
3. On the capture Worker (`<staging-worker>`, then the production one), set three secrets. The private key is the
   `VAPID_PRIVATE_KEY` line and only ever goes here. `VAPID_SUBJECT` is the app's own https origin, such as
   `https://<staging-app-host>`, with no email address in it, so no token carries one:

   ```bash
   npx wrangler secret put VAPID_PRIVATE_KEY --name <staging-worker>
   npx wrangler secret put VAPID_PUBLIC_KEY --name <staging-worker>
   npx wrangler secret put VAPID_SUBJECT --name <staging-worker>
   ```

   Each `secret put` makes a new Worker version, so after three there are three more versions than before. When rolling
   back, name the version you want: a rollback keeps the secrets that version had, which are the ones set before it was
   made.
4. On each Pages project (staging, then production) set `VAPID_PUBLIC_KEY` to the same public value as a plain variable,
   so `GET /api/push-config` can hand it to the browser. The Pages deploy must follow it, since variables apply to new
   deployments.
5. Install the app to the Home Screen on a phone and turn notifications on in Settings. Choose "For every payment"
   there: turning on leaves the daily summary at 20:00 chosen, which sends nothing until the evening. Then
   send one test payment by hand to the staging Worker, with a capture key of your own from Settings. The values are
   invented; the body needs `app`, `title`, `body` and an ISO-8601 `date`:

   ```bash
   curl -sS -X POST https://<staging-worker-host>/capture \
     -H 'Authorization: Bearer <your-capture-key>' \
     -H 'Content-Type: application/json' \
     -d '{"app":"Test bank","title":"Card payment","body":"You paid 4,20 EUR to Example Cafe","date":"2026-01-15T12:00:00+01:00"}'
   ```

   It answers `{"ok":true}`, the phone shows "Payment to review", and the device row's status in the card turns to 201.
   Delete the test recommendation and the key afterwards.
6. Check the hourly trigger. It is part of `wrangler.toml`, so the deploy in step 2 already carries it. The Worker's
   Triggers page in the dashboard lists one cron, `0 * * * *`. The first run after 20:00 in your zone sends your
   summary if a payment is waiting, and the Worker's Logs show an `event: 'push'` line for it.
7. Repeat for production, after migration 0044 is on that database.

The public key given to a browser at subscribe time must be the one the Worker signs with. Replacing the pair later
leaves every saved subscription unusable (the push service answers 403 or 410), and each device must turn
notifications off and on again.
