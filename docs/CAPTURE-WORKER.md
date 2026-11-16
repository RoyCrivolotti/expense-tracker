# The capture endpoint

For a contributor changing the Worker that accepts pushes. How a push becomes a recommendation, and the screens that review it, are in [CAPTURE.md](CAPTURE.md).


`POST /capture` on its own Worker ([`workers/capture`](../workers/capture/src/index.ts)), not a route of the app. It
has a `workers.dev` address, one D1 binding and no receipts bucket, so no `/api` route can accept a capture key and
the app's Access settings are not part of its risk. It never reads the Access headers: the owner is the key's.

Refusals come in this order, and the first five touch no database: wrong path 404, method 405, a key that is not
`Authorization: Bearer xpk_<16 hex>_<64 hex>` 401, a declared size over 16 KB 413, a content type other than JSON 415.
Then one read by key id. Every key problem (unknown id, wrong secret, revoked, owner off the allow-list or without the
Expenses group) is the same 401, byte for byte, and an unknown id still compares against a dummy hash. A body is read
through a counted stream and stops at 16 KB. A body that is not `{ source, title, body, date }`, or whose `source` is not a source word, is a fixed 400. Source words and adding kinds: [CAPTURE-KINDS.md](CAPTURE-KINDS.md).

What happens to a push:

| Push | Result |
| --- | --- |
| Listed kind ([`KIND_RULES`](../src/domain/capture/classify.ts)), readable Date | One event and one open recommendation, in one batch. The recommendation's `occurredAt` is the phone's own clock with its offset (`2026-11-03T09:41:07+01:00`), so the app can read the time of day the payment was made. An older row written in UTC (`Z`) has no known offset. Answers `{"ok":true}` |
| Same push again | Stored once. The same 200 |
| Any other kind, a source with no rows, or a Date more than two days from the clock | Adds to that day's `unrecognised` counter. Nothing else is kept |
| Over a cap | 429 with `Retry-After`, and nothing stored |

Caps, all checked inside the insert that stores the count or the row, so parallel requests cannot pass them together:
20 pushes an hour and 100 a day per key, 200 pushes a day per person (recognised or not), 2,000 a day across everyone,
2,000 open recommendations per person, and 8 different source words per person. They are starting guesses.

Two things are stored under a secret. The replay hash is an HMAC under `CAPTURE_REPLAY_SECRET`, so a stored hash cannot
be matched against a guessed body such as a one-time code. With the secret unset the Worker answers 503 to everything.
Errors answer a fixed 500 and log a fixed line, never text built from a push.

Not yet here: pairing a balance alert with the push it follows, holding a card approval until its purchase push
arrives, a list of pushes that could not be read, the Santander kinds, and the screens. Until then only Iberia's
purchase push creates anything.

There is no per-address rate limit. A caller with no key who sends a well-formed header costs one hash and one D1 read
per request and cannot write anything. A `workers.dev` address has no zone, so no rate rule can sit in front of it. If
abuse is seen, a Workers Rate Limiting binding is the fix.

## Reading what the Worker did

Each request writes one line to Workers Logs (`[observability]` in `workers/capture/wrangler.toml`), whatever its
outcome: `outcome` (`stored`, `replay`, `dropped`, `refused`, `limited`, `error`), a short `reason`, the `status` the
phone got, the `source` word, the public `keyId`, the matched `kind`, whether an `amount` was read, and `ms`. Nothing from
the push goes in: no title, body, merchant, amount, digits or email, and an error is logged by its class only. A phone
whose request never shows up here never reached the Worker, which points at the Shortcut rather than the app.

## Deploying it (not done by any script here)

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
