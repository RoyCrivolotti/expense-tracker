# Bank-push capture

For a contributor changing how the app turns a bank's push notifications into recommendations. It covers the capture
key, the endpoint that accepts it and the routes that list and decide recommendations, all built; the screens are added
as they land.

A person's phone runs a Shortcuts automation for each bank app and posts each notification with a capture key. The app
only ever adds a recommendation the person edits and submits, never an expense of its own.

## The capture key

A key is `xpk_<16 hex>_<64 hex>`. The first part is a public id the server looks the key up by. The second is the
secret, 256 random bits, of which only a SHA-256 is stored. Hex rather than base64url so a `_` can only be the
separator, and a fixed length so one pattern refuses anything else before any lookup. The code is in
[`captureKey.ts`](../src/domain/capture/captureKey.ts).

- **Made in Settings** by the signed-in person, behind the capture flag (`?capture=on`, kept in the browser; off by
  default). The owner is the verified email and nothing in the body can change it.
- **Shown once.** The create call returns the whole key and nothing else ever does. The list returns id, name, when it
  was made and when it was last used.
- **Three at a time** per person, checked inside the insert so two requests made at once cannot make a fourth. A fourth
  is a 409. Replacing a key is making a new one, then revoking the old.
- **Revoked, not deleted.** The row is kept, and the limit counts live keys only, so revoking frees a slot. Revoking takes effect on the next request the key makes. Another person's key, a revoked key
  and an unknown id all answer 404, so ids cannot be probed.
- **Compared as digests.** The endpoint compares the SHA-256 of the secret it was sent with the stored one, using
  `crypto.subtle.timingSafeEqual` where the runtime has it and a loop over all 32 bytes where it does not.
- **A key opens one door.** The management routes live under `/api` and need the sign-in, so a key sent to them is a 401
  like any request with no identity.

## Routes

| Route | Answers |
| --- | --- |
| `GET /api/capture-keys` | `{ keys: [{ keyId, label, createdAt, lastUsedAt }] }`, newest first, live keys only |
| `POST /api/capture-keys` | 201 with the same fields and `key`. Body: a JSON object with an optional `label` (at most 40 characters, no control characters; blank becomes "Shortcut"), at most 1 KB. 409 at the limit |
| `DELETE /api/capture-keys/:id` | `{ ok: true }`, or 404 |
| `GET /api/capture-cards` | `{ cards: [{ source, digitsKind, digits, accountId }], waiting: [{ source, digits, count }] }`. `waiting` is the cards open payments wait on for want of an account, with how many wait |
| `POST /api/capture-cards` | `{ ok: true }`. Body: `{ source, digits, accountId }` and an optional `digitsKind` (`card` by default, or `account`), at most 1 KB. `source` is `iberia` or `santander`, `digits` is exactly four digits, `accountId` is one of the person's own accounts (404 otherwise, as for one that does not exist). Saving the same link again changes nothing, and saving it for another account moves it. 409 at 50 links |
| `DELETE /api/capture-cards` | `{ ok: true }`, or 404. The same body names the link, so the digits are never in the address |

These writes (and card links) leave the owner's dataset revision alone, since they change nothing a
ledger reader sees; the exemption is in [`_middleware.ts`](../functions/api/_middleware.ts).

## Card links

A push shows the last four digits of the card it was paid with. A link says which of the person's accounts those digits
are, so a payment arrives with its account. It is stored in `capture_cards` (source, kind, digits, account) and the
digits are stored in clear, since they are four of sixteen and the person needs to see which card each link is. Every
read and write is for the signed-in person alone.

- **Several digit sets can share one account.** A bank reissues a card with new digits and the old card can still appear
  on subscriptions and refunds, so linking new digits to an account adds a link and keeps the old one. Nothing is
  replaced on its own: removing the old link is a person's choice, in Settings.
- **The same digits from two bank apps are two links**, and a card and an account's digits are two kinds.
- **A link that points at a deleted account** counts as no link: its payments wait again, and linking those digits
  again points them at a live account.
- **Open payments follow the link.** The account is written when a push arrives, so saving a link also writes it onto
  the open recommendations those digits made, and removing a link unmaps them, in the same batch. The list then needs no
  join to know a payment's account, and decided payments are never touched.
- **One known gap.** Removing an `account`-kind link unmaps the open payments those digits made even if a `card` link also gave
  them their account. The Worker reads only card digits today, so it cannot happen yet; it needs a look when account
  digits start to be read.
- **The list says which card a payment came from** (`card: { source, digits }`, or null for a push with no digits), so
  the screen can ask "which account is the card ending ...?" the first time it sees one.

## Recommendations

A recommendation is what a recognised push becomes: an amount, the text as the bank sent it, a date, an account when the
card is mapped, and a suggested type the person can change. It is never an expense until they submit it. All routes are
the signed-in person's own; another person's recommendation and an id that is not one both answer 404.

| Route | Answers |
| --- | --- |
| `GET /api/recommendations?limit=&after=` | `{ recommendations, next, openCount }`: open ones, newest day first. `limit` is 1 to 100 (default 50). `next` is the `after` for the following page, or `null` on the last. Anything else for either is a 400 |
| `POST /api/recommendations/:id/submit` | 201 with the new transaction. The body is the transaction exactly as `POST /transactions` takes it, and is validated the same way. It is not checked against the recommendation: the person may change anything, and nothing is copied from it |
| `POST /api/recommendations/:id/dismiss` | `{ ok: true }`. Creates nothing. Takes no body |
| `POST /api/recommendations/:id/link` | `{ ok: true }`. Body `{ "transactionId": n }`: the person already typed that row. 404 if it is not theirs, 409 if another recommendation answers for it |

Each decision happens once: a second one is a 409. Submitting creates the row first and then marks the recommendation,
because the two cannot share a D1 batch through the create path. If a second tap decided it in between, or the mark
failed, the row just created is deleted again. Submit moves the dataset revision like any write that adds an expense.
Dismiss, link and the list leave it alone, since the ledger a reader sees does not change.

## The capture endpoint

`POST /capture` on its own Worker ([`workers/capture`](../workers/capture/src/index.ts)), not a route of the app. It
has a `workers.dev` address, one D1 binding and no receipts bucket, so no `/api` route can accept a capture key and
the app's Access settings are not part of its risk. It never reads the Access headers: the owner is the key's.

Refusals come in this order, and the first five touch no database: wrong path 404, method 405, a key that is not
`Authorization: Bearer xpk_<16 hex>_<64 hex>` 401, a declared size over 16 KB 413, a content type other than JSON 415.
Then one read by key id. Every key problem (unknown id, wrong secret, revoked, owner off the allow-list or without the
Expenses group) is the same 401, byte for byte, and an unknown id still compares against a dummy hash. A body is read
through a counted stream and stops at 16 KB. A body that is not `{ source, title, body, date }` is a fixed 400.

What happens to a push:

| Push | Result |
| --- | --- |
| Listed kind ([`KIND_RULES`](../src/domain/capture/classify.ts)), readable Date | One event and one open recommendation, in one batch. The recommendation's `occurredAt` is the phone's own clock with its offset (`2026-11-03T09:41:07+01:00`), so the app can read the time of day the payment was made. An older row written in UTC (`Z`) has no known offset. Answers `{"ok":true}` |
| Same push again | Stored once. The same 200 |
| Any other kind, or a Date more than two days from the clock | Adds to that day's `unrecognised` counter. Nothing else is kept |
| Over a cap | 429 with `Retry-After`, and nothing stored |

Caps, all checked inside the insert that stores the count or the row, so parallel requests cannot pass them together:
20 pushes an hour and 100 a day per key, 200 pushes a day per person (recognised or not), 2,000 a day across everyone,
and 2,000 open recommendations per person. They are starting guesses.

Two things are stored under a secret. The replay hash is an HMAC under `CAPTURE_REPLAY_SECRET`, so a stored hash cannot
be matched against a guessed body such as a one-time code. With the secret unset the Worker answers 503 to everything.
Errors answer a fixed 500 and log a fixed line, never text built from a push.

Not yet here: pairing a balance alert with the push it follows, holding a card approval until its purchase push
arrives, a list of pushes that could not be read, the Santander kinds, and the screens. Until then only Iberia's
purchase push creates anything.

There is no per-address rate limit. A caller with no key who sends a well-formed header costs one hash and one D1 read
per request and cannot write anything. A `workers.dev` address has no zone, so no rate rule can sit in front of it. If
abuse is seen, a Workers Rate Limiting binding is the fix.

### Deploying it (not done by any script here)

Everything below changes Cloudflare and needs the account owner's say-so, staging first.

1. Create the Worker `expense-capture` from `workers/capture` with `account_id` and `database_id` filled in locally
   (they are not committed).
2. Bind the staging D1 database as `DB`.
3. `wrangler secret put CAPTURE_REPLAY_SECRET` with 32 random bytes of hex, one per environment.
4. Set `OWNER_EMAIL` to the same value the app uses, as a secret or variable and never committed. The owner reaches
   the app without an Expenses grant only through it, so without it the owner's own key is refused. Anyone else
   needs a grant either way.
5. Send a staging key's POST from a shell and check: valid key 200, wrong key 401, the same key to the app's
   `/api/expenses` 401.
6. Repeat for production, after migration 0040 is on that database.
