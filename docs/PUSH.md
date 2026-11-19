# Web push

For a contributor changing how the app tells a phone that a captured payment is waiting. It covers what a device's
subscription is, where it and the person's choice are kept, the routes, the Settings card that turns a device on, and
what the service worker does with a push and a tap. The payments themselves are in [CAPTURE.md](CAPTURE.md), and the
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

Settings, Account, "Notifications" ([`PushSetting.tsx`](../src/ui/settings/PushSetting.tsx), its own lazy chunk in the
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
  three radio rows with the zone under them.

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
- **A tap** opens the payload's URL inside the app and never another origin: an open window of the app is brought
  forward and sent there, else one is opened. The URL is `/?review=<id>`; the review card, which mounts once there is
  something to review, opens that payment's form as "Review" would, once, and takes the id off the URL. A payment no
  longer waiting opens nothing, and the card is there. A summary's URL is `/`.
