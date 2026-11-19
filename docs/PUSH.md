# Web push

For a contributor changing how the app tells a phone that a captured payment is waiting. It covers what a device's
subscription is, where it and the person's choice are kept, and the routes. The payments themselves are in
[CAPTURE.md](CAPTURE.md), and the card that reviews them in [CAPTURE-REVIEW.md](CAPTURE-REVIEW.md).

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
