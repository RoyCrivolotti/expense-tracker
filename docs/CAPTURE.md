# Bank-push capture

For a contributor changing how the app turns a bank's push notifications into recommendations. It covers the capture
key, the endpoint that accepts it and the routes that list and decide recommendations, the Dashboard card that reviews
them, and the setup screen with the shortcut recipe, all built.

A person's phone runs a Shortcuts automation for each bank app and posts each notification with a capture key. The app
only ever adds a recommendation the person edits and submits, never an expense of its own.

## The capture key

A key is `xpk_<16 hex>_<64 hex>`. The first part is a public id the server looks the key up by. The second is the
secret, 256 random bits, of which only a SHA-256 is stored. Hex rather than base64url so a `_` can only be the
separator, and a fixed length so one pattern refuses anything else before any lookup. The code is in
[`captureKey.ts`](../src/domain/capture/captureKey.ts).

- **Made in Settings** by the signed-in person, behind the capture flag (`?capture=on`, kept in the browser, or the "Capture screens (beta)" switch in Settings, About
  this app; off by default). The owner is the verified email and nothing in the body can change it.
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
| `GET /api/capture-status` | `{ sources: [{ source, lastCaptureAt, received, unrecognised }], endpoint, shortcutUrl }`, one entry per bank app. `lastCaptureAt` is when the newest recognised push was stored (null if none). `received` and `unrecognised` are the sums of the last seven UTC days of `capture_counters`. `endpoint` is the Worker's full address, `<CAPTURE_ENDPOINT origin>/capture`, or null when the variable is unset or is not an https address. `shortcutUrl` is the `CAPTURE_SHORTCUT_URL` link when it is an https link on `www.icloud.com` or `icloud.com` under `/shortcuts/` (credentials and ports are refused, the query and fragment are dropped), else null. Reads only |

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
| `GET /api/recommendations?limit=&after=` | `{ recommendations, next, openCount }`: open ones, newest day first. `limit` is 1 to 100 (default 50). `next` is the `after` for the following page, or `null` on the last. Anything else for either is a 400. Each one carries `possibleMatch` (below) and the `card` it came from |
| `POST /api/recommendations/:id/submit` | 201 with the new transaction. The body is the transaction exactly as `POST /transactions` takes it, and is validated the same way. It is not checked against the recommendation: the person may change anything, and nothing is copied from it. It is also refused with 409 `{ code: "possible-duplicate", possibleMatch }` when a typed row already looks like what is being submitted, unless the body carries `allowDuplicate: true` (a strict boolean; anything else is a 400, and it is never stored on the row) |
| `POST /api/recommendations/:id/dismiss` | `{ ok: true }`. Creates nothing. Takes no body |
| `POST /api/recommendations/:id/link` | `{ ok: true }`. Body `{ "transactionId": n }`: the person already typed that row. 404 if it is not theirs, 409 if another recommendation answers for it |

Each decision happens once: a second one is a 409. Submitting creates the row first and then marks the recommendation,
because the two cannot share a D1 batch through the create path. If a second tap decided it in between, or the mark
failed, the row just created is deleted again. Submit moves the dataset revision like any write that adds an expense.
Dismiss, link and the list leave it alone, since the ledger a reader sees does not change.

## The Dashboard card

Behind the capture flag, the Dashboard opens with a "To review" card: the newest three open recommendations, each with
all seven fields it would become (type, amount, description, category, account, date, budget month). It is absent when
nothing is waiting, and the Dashboard tab carries the count (the Settings badge still means pending access requests).
"See all" opens the rest in a sheet. The card and the sheet are one lazy chunk with its own line in the bundle budget; the
list, the count and the undo window live in the main bundle, so the badge needs no download.

What each payment becomes is worked out on the device from the push and the typed rows the app holds, never stored
([`review.ts`](../src/domain/capture/review.ts)). The description and category are the newest typed row of the same
merchant (bank text with the words that hold a digit dropped, case and accents folded). The budget month comes from the
same rule as the add form.

| | |
| --- | --- |
| **One tap Add** | Only when nothing is in doubt. It sends the transaction shown, exactly |
| **Review** | Everything else. It opens the normal add form, filled with only what the push said. With "Add and next (N left)" each save opens the next payment, and the form's "Don't add" moves on without creating anything |
| **Don't add** | Removes only that suggestion. It creates nothing and teaches the app nothing |
| **Link** | Offered when the server names a typed row that looks the same (`possibleMatch`). It points the recommendation at that row and creates nothing |

A payment is reviewed rather than added by one tap when: no merchant text, no amount or an amount of zero, a category not
in use or never typed for this merchant, a card not mapped to an account (a card is mapped by answering the question below, once), a currency other than euros (the amount is not copied into the euro form),
no suggested type or an investment (the user's own money moved), a merchant typed fewer than twice, a typed row that
looks the same, or a budget month that could differ.

That last test is one rule: the budget month (the add form's own rule, so the user's rollover day and a settled statement
count) is worked out for the payment's day and for every day the bank might book it on, which are the day before or after
when the payment is within an hour of midnight, and the day its push reached the server. If any of those gives another
budget month the payment is reviewed, and the add form shows a note under the date with both days and a button to move
between them. The payment's time of day is the phone's own, read from `occurredAt` (see the endpoint table below), so
the device's zone does not matter; a row without it counts as next to an edge on the days either side of midnight.

One tap, "Don't add" and Link are held for five seconds, and nothing is sent until then. Undo covers the last one only:
a new decision sends the held one at once, and so does the app going out of sight. A send that fails puts the payment
back with the reason. The add form saves at once, since it needs the new row's id for receipts, so it has no undo.

A payment from a card with no linked account opens with the Account field empty ("Pick an account") and a question under
the date: which account is the card ending in those digits, with "Remember this card" on. Saving is refused until it is
answered, with the message beside the question. The card is remembered after the payment is saved, against the account
the payment was saved with, so if the person changes the form's Account after answering, the card follows the final
account.

Without write access (the offline saved copy, a read-only source) the card shows the rows with no buttons. The merchant
history reads the rows the app holds, which in the paged ledger mode are the months in view, so a merchant typed only
earlier counts as new.

## The typed row a payment may duplicate

A person often types a payment at the till, and the push arrives minutes later. Each recommendation in the list carries
`possibleMatch: { transactionId, description, date }`, or null: a row the person already typed that looks like the same
payment. The list never blocks anything, since a wrong match costs one tap: the payment goes to Review, where Link points it at
that row. Submit looks again, because a row can be typed between the list read and the press: it checks the row being
submitted (its date, amount and type, so a payment the person changed is judged as changed) with the same rule and window,
and answers 409 `possible-duplicate` with the match when one exists, creating nothing. Sending `allowDuplicate: true`
skips the check. A row typed between that one read and the insert is not caught, which is a deliberate advisory race.
The rule is [`possibleMatchFor`](../src/domain/capture/duplicate.ts), with its window in one constant,
`DUPLICATE_WINDOW`, shared by both reads:

- the same person's row, never another person's;
- the same direction: an expense and an investment put in are money out, income and a refund and an investment taken
  back out are money in, and a payment with no suggested type has no direction and matches nothing;
- the same amount to the cent, in euros (a payment in another currency or with no amount matches nothing);
- a date from 14 days before the payment's local date to 3 days after it. Back 14, because with no limit a regular price
  (the 12,50 cafe) would match an old row every time and never allow one tap; forward 3, because a row may be dated by the
  day the bank books it;
- not a cancelled row, and not a row some recommendation already answers for (linked by hand, or made by submitting one),
  so a payment that was captured and added does not match the next push of the same price;
- the closest by date, and the highest id (entered last) on a tie. A row goes to one payment of the page only, the
  one it is closest to (the newer payment first on a tie), and a payment that loses its row falls to its next best or to
  none, so two payments of one price never offer the same row.

The candidates of a whole page come from one query, over the date span of the page widened by the window and only the
prices on the page, using the existing index on owner and date. The cost is the rows of that span, once per list call,
whatever the page size. The check at submit is the same statement for one amount and one date, so it reads at most the
rows of one 18-day window and needs no new index.

## Setting up a phone

Settings, Account, "Set up capture" lists these steps and checks that the first payment arrived. **A shortcut built by hand from these steps worked on one phone, and
so did the same shortcut installed from a shared copy. Neither has been tried on a second phone, or from the installed Home
Screen app.** The Get Contents of URL part follows [Apple's guide](https://support.apple.com/guide/shortcuts/apd58d46713f/ios).
The If step is untried: the action returns the answer rather than failing, so it can catch a refusal but probably not a
missing connection. Only Iberia has a recipe; Santander joins with its own change.

1. **iOS 27.** The trigger "When I receive a notification from" was seen on iOS 27. Older iPhones and Android are untried.
   The app cannot tell the phone's version (Safari freezes it in the user agent), so the screen asks the person to check
   Settings, General, About.
2. **Make a key** in Settings, Capture key. It is shown once.
3. **Build the shortcut.** Add the trigger "When I receive a notification from" and pick the app: Santander, or
   IberiaCards for the Icon card (one word, as it appears in the notification's App field). Leave the filters empty. Make
   one automation per app. Add Get Contents of URL, tap Show More, set Method to POST and Request Body to JSON, then add
   four fields: `source` (typed text, `iberia` or `santander`), `title` and `body` (the notification's Title and Body), and
   `date` (the notification's Date). In saved notes the date arrived as ISO 8601 with the phone's offset, such as
   `2026-11-03T09:41:07+01:00`, so try that date format (in Shortcuts it is called ISO 8601, under the Date token's Date
   Format or a Format Date action). Optional: add an If that checks the answer contains `ok`, and otherwise shows the
   notification "Capture failed".
4. **Point it at the app.** URL: the address on the screen, exactly as shown. Header `Authorization` with the value
   `Bearer`, a space, then the key.
5. **Run it automatically.** Keep Automation on. Notify was off on the automations that were tried; whether it matters is
   untried. Turn on Allow Running When Locked (the info button, Privacy). The automation's own editor has shown "Automation
   is turned off" while it was running, so trust the automation list and the first real payment, not that line.
6. **If iOS asks whether the shortcut may send data to that address**, allow it and choose the option that remembers
   the answer. If it asks again on every payment an unattended run cannot work yet. That is untested.
7. **The check.** The screen reads `GET /api/capture-status` and shows one of four states for Iberia. Grey "Waiting for
   your first payment": nothing has reached the app. Amber "Arriving, not read as a payment": pushes arrived over the last
   seven days (`capture_counters.received`) and every one went unread (`unrecognised` equals `received`), or none ever
   was read, which is what a bank rewording its message looks like. Amber "Nothing captured lately": the newest recognised
   push (`capture_events`) is more than 3 days old (`STALE_DAYS` in `captureSetup.ts`). Green "Last payment captured",
   with the time, otherwise, and with "N of M unread in the last 7 days" when some pushes were unread. While the read is out the card says only "Checking", and when it fails it shows the error alone, never a claim about the phone. It is information only: there is no banner, reconciliation or notification, so a stopped
   automation is noticed only by the person.

The address is the `CAPTURE_ENDPOINT` Pages variable of the environment, a plain variable holding the Worker's address.
The hostname is private, so it is never committed; docs and tests use `https://capture.example.workers.dev`. Where the
variable is unset the screen asks for the address to be pasted and keeps it in that browser only.

### The "Add the shortcut" button

With `CAPTURE_SHORTCUT_URL` set (a plain Pages variable holding an iCloud share link to the shortcut, such as the invented
`https://www.icloud.com/shortcuts/example0000000000000000000000000000`), the card replaces steps 3 and 4 with a button that
opens the link in its own tab. It is an ordinary link: the app never fetches it. Shortcuts opens and asks for the
person's capture key, so the shared copy carries no key; the Worker's address is inside the shared shortcut, so
`CAPTURE_ENDPOINT` is not needed on that path. The steps become: check the phone, make a key and copy it, add the
shortcut, run it automatically, and the iOS question. Unset, or not an iCloud shortcuts link, the card shows the manual
steps above. The variable is never committed, because re-sharing a shortcut gives a new link. Not tried: the button from
the installed Home Screen app, and whether the notification automation arrives switched on.

### Turning the screens on

The flag is per browser: `?capture=on` in the address, or Settings, About this app, "Capture screens (beta)". The switch
exists because an installed Home Screen app has no address bar. It sets the same value in that app's own storage and
reloads. The screens read the flag when they mount, so nothing changes until the reload.

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
