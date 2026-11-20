# Bank-push capture

For a contributor changing how the app turns a bank's push notifications into recommendations. It covers the capture
key, the endpoint that accepts it and the routes that list and decide recommendations, the Dashboard card that reviews
them, and the Settings screens, all built. How any push is read, with no bank or language word in the code, is in
[CAPTURE-SHAPES.md](CAPTURE-SHAPES.md), and the Dashboard card that reviews recommendations is in
[CAPTURE-REVIEW.md](CAPTURE-REVIEW.md).

A person's phone runs a Shortcuts automation for each bank app and posts each notification with a capture key. The app
only ever adds a recommendation the person edits and submits, never an expense of its own.

## What a push becomes

Every push that shows one amount with a currency marker (`12,50 EUR`, `$18.20`, `€4`) becomes a recommendation, from
any bank and in any words: the amount, the marker's currency, the type `expense` until the person's decisions teach
the wording another, and the whole push as its description until a second push of the wording shows where the
merchant is. Everything else is counted per source and day as unread, and nothing of it is kept:

- **No amount with a currency marker**, such as a "bills paid" push with no total, or two marked amounts that differ (a
  charge and a balance), which the reader cannot tell apart.
- **Only a code**: no amount and a 4 to 8 digit number, which is what a one-time code looks like.
- **A Date it cannot trust**: unreadable, more than a week older than the server's clock (a phone can hold a notification back, so a late one is still taken), or more than two days ahead of it.
- **A muted wording**: three dismissals in a row on a wording never added.

The Worker's log says which of these each push was ([CAPTURE-WORKER.md](CAPTURE-WORKER.md)).

**One movement, one recommendation.** A bank often sends several pushes for one movement: a card payment and a balance
alert of the same amount seconds later, or a purchase and an offer to split it. A push with the same amount and currency
as an open recommendation of the person, at most 2 minutes from it by the moment each push gives, and of another
wording, joins that recommendation instead of making a second (`sameMovement`, `src/domain/capture/grouping.ts`). The
window is short because in real pushes the second push of one movement came within seconds, while two real movements
of one amount (money in, then the same amount sent on) came minutes apart. It is not limited to one bank app: two apps
reporting one payment join, and so would two shops charging the same price within two minutes. Two
pushes of one wording are always two movements, two coffees at the same price being two payments, and a decided
recommendation takes no more pushes. The statement that stores the push decides it, so two pushes arriving together
cannot both make one. What the person sees is in [CAPTURE-REVIEW.md](CAPTURE-REVIEW.md).

## The capture key

A key is `xpk_<16 hex>_<64 hex>`. The first part is a public id the server looks the key up by. The second is the
secret, 256 random bits, of which only a SHA-256 is stored. Hex rather than base64url so a `_` can only be the
separator, and a fixed length so one pattern refuses anything else before any lookup. The code is in
[`captureKey.ts`](../src/domain/capture/captureKey.ts).

- **Made in Settings**, Capture by the signed-in person. The owner is the verified email and nothing in the body can change it.
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
| `POST /api/capture-cards` | `{ ok: true }`. Body: `{ source, digits, accountId }` and an optional `digitsKind` (`card` by default, or `account`), at most 1 KB. `source` is a source word ([CAPTURE-SHAPES.md](CAPTURE-SHAPES.md)), `digits` is exactly four digits, `accountId` is one of the person's own accounts (404 otherwise, as for one that does not exist). Saving the same link again changes nothing, and saving it for another account moves it. 409 at 50 links |
| `DELETE /api/capture-cards` | `{ ok: true }`, or 404. The same body names the link, so the digits are never in the address |
| `GET /api/capture-status` | `{ sources: [{ source, lastCaptureAt, received, unrecognised, diagnostics }], malformed, endpoint, shortcutUrl }`, one entry per source word the person's pushes were ever counted under, in order, and none before the first push. `lastCaptureAt` is when the newest stored push arrived (null if none). `received` and `unrecognised` are the sums of the last seven UTC days of `capture_counters`. `malformed` is how many requests from the person's keys over the same seven days had a body the Worker could not read. `diagnostics` covers the last 30 UTC days: `received` and `unread` from the counters, `recommended` (pushes that made a recommendation), `grouped` (pushes that joined one), `addedAsIs`, `edited`, `linked` and `dismissed` from `capture_events.outcome`, `open` (recommendations still waiting) and `muted` (the source's templates muted now). Counts only. `endpoint` is the Worker's full address, `<CAPTURE_ENDPOINT origin>/capture`, or null when the variable is unset or is not an https address. `shortcutUrl` is the `CAPTURE_SHORTCUT_URL` variable when it is exactly `https://www.icloud.com/shortcuts/<letters and digits>` (no spaces, query, fragment or extra path), otherwise null. Nothing else is ever reflected into a link. Reads only |
| `GET /api/capture-shortcut` | The generic Shortcut file, the same bytes for everyone signed in: `shortcuts/capture.shortcut` from the app-files bucket (the `APP_FILES` binding) as `application/octet-stream`, `Content-Disposition: attachment; filename="Expense capture.shortcut"`, `nosniff`, `private, no-store`. 404 when it is missing, `APP_FILES` is not bound, or the object is over 256 KB. Reads only |
| `GET /api/capture-templates?ignored=1` | `{ templates: [{ templateId, source, skeleton, seen, dismissals, ignoredAt }] }`: the person's ignored templates (below, "What it learns"), newest ignore first, at most 100. `skeleton` is the masked wording, never a push's body. Any other query is a 400. Reads only |
| `POST /api/capture-templates/:id/unignore` | `{ ok: true }`, or 404 for another person's template or an id that is none. Clears the ignore and the dismissal streak, so the next push of that wording is suggested again. Takes no body |

These writes (and card links and un-ignoring) leave the owner's dataset revision alone, since they change nothing a
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

A recommendation is what a stored push becomes: an amount, the text as the bank sent it, a date, an account when the
card is mapped, and a suggested type the person can change. It is never an expense until they submit it. All routes are
the signed-in person's own; another person's recommendation and an id that is not one both answer 404.

| Route | Answers |
| --- | --- |
| `GET /api/recommendations?limit=&after=` | `{ recommendations, next, openCount }`: open ones, newest day first. `limit` is 1 to 100 (default 50). `next` is the `after` for the following page, or `null` on the last. Anything else for either is a 400. Each one carries `possibleMatch` and `suggestion` ([CAPTURE-REVIEW.md](CAPTURE-REVIEW.md)) and the `card` it came from |
| `POST /api/recommendations/:id/submit` | 201 with the new transaction. The body is the transaction exactly as `POST /transactions` takes it, and is validated the same way. It is not checked against the recommendation: the person may change anything, and nothing is copied from it. It is also refused with 409 `{ code: "possible-duplicate", possibleMatch }` when a typed row already looks like what is being submitted, unless the body carries `allowDuplicate: true` (a strict boolean; anything else is a 400, and it is never stored on the row) |
| `POST /api/recommendations/:id/dismiss` | `{ ok: true }`. Creates nothing. Takes no body |
| `POST /api/recommendations/:id/link` | `{ ok: true }`. Body `{ "transactionId": n }`: the person already typed that row. 404 if it is not theirs, 409 if another recommendation answers for it |

Each decision happens once: a second one is a 409. Submitting creates the row first and then marks the recommendation,
because the two cannot share a D1 batch through the create path. If a second tap decided it in between, or the mark
failed, the row just created is deleted again. Submit moves the dataset revision like any write that adds an expense.
Dismiss, link and the list leave it alone, since the ledger a reader sees does not change. Once a decision has changed
the row, the template of the push behind it learns from it (below).

## What is stored

A stored push becomes one `capture_events` row and one open recommendation. What it keeps of the push's text follows
one rule. The cleaned body (`body`, at most 500 characters) is blanked when the person decides the recommendation
(submit, dismiss or link, in the same batch as the decision) or 30 days after the push arrived (the arrival, not the Date it carries, so a late push keeps its text as long as any other), whichever comes first.
Only a push with a currency-marked amount is stored at all, so a push that holds nothing but a code keeps no text,
without the app knowing what a code push says. A push that shows a code beside a currency amount is stored like any
other, and its body, code included, stays until it is decided or for 30 days. The event's copy of the description (`merchant_raw`, which for a first push of a wording is the whole body)
and the older `body_excerpt` column, no longer written, are blanked by the same rule. The recommendation's description
is the person's and stays. The 30-day rule is checked whenever a new push arrives, so when a person's pushes stop,
text older than 30 days stays until their next push.

Each stored push also keeps its shape (`shape_id`) and its slots (`slots`: the numbers, card digits, dates and codes as
JSON, at most 2,000 characters), and joins a template (`template_id`), a row of `capture_templates`, one per person and
per way their bank words a push: the title and text with every number masked, and how often it was seen.

A template is not covered by the 30-day rule, and it keeps words. The first push of a wording leaves its merchant, or
the name of the person it names, in the template's text. Once a second push shows which words vary, those words become
`<M>`, and until one does they stay for as long as the template lives. A name in the title is never replaced, since the
title is how sibling pushes are found. A person holds at most 500 templates; at the cap the least recently seen one
nobody has accepted makes room, and an ignored one is never evicted.

The recommendation's description (`merchant_raw`) is the merchant when the template knows where it sits, and the whole
cleaned body for the first push of a template, which the person edits once. How the template and the merchant are found
is in [CAPTURE-SHAPES.md](CAPTURE-SHAPES.md), "At receipt".

A person's merchants are in `capture_merchants` ([migration 0042](../migrations/0042_capture_merchants.sql)): per
merchant, the descriptions the person added its payments with, each with its category, type, account and a count of
votes, once for any price and once per price. The merchant is only a key, its name folded with digit words dropped, at
most 80 characters, and a key is only written from a recommendation whose text is the merchant rather than a whole push
(below). Nothing else of a push is kept there. A person holds at most 2,000 rows; the least recently seen make room.

## What it learns

Each decision teaches that person's template of the push ([`learn.ts`](../src/domain/capture/learn.ts)). An accept is
a submit or a link, read from the row saved or linked:

- **Amount slot and mark**: the number in the push that holds the saved amount, and the decimal mark that reading
  assumed, learned from an accept whose amount matches exactly one reading. A tie or no match teaches nothing.
- **Type**: the saved row's type. The last accept wins.
- **Account**: the saved row's account, only when the push showed no card digits. A card's account is its link.
- **Merchant**: the saved row's description, as typed and trimmed, with its category, type and account, one vote at any
  price and one at the saved price ([`merchants.ts`](../src/domain/capture/merchants.ts)). Only when the recommendation's
  text is the merchant: text that shows the amount with its currency marker is a whole push, which is never learned. A
  dismissal teaches the merchant nothing. Votes are counted in SQL, so two decisions at once both count.
- **Ignoring a wording**: three dismissals in a row on a template nobody has accepted mute it. Its later pushes of the
  same wording are counted as unread on the setup screen and make no recommendation. An accept, or the un-ignore route, ends the streak.
  Settings, Capture, "Muted pushes" lists the muted wordings by their masked words, with "Suggest again". An accepted template is never muted this way.

The event records what the person did in `outcome`: `added-as-is`, `edited:` and the fields changed (amount, type,
account, description, category), `linked` or `dismissed`. An add is compared with what the card showed: the list's
suggestion, worked out again from what was known before the decision rather than stored on the read, and the bank's
words where it named no description, since the server cannot see the phone's own history. Learning runs after the decision, in one batch guarded by that empty
outcome so a retry counts nothing twice, and a failure there is logged by class while the decision stands. The list reads
these facts to suggest what each payment becomes ([CAPTURE-REVIEW.md](CAPTURE-REVIEW.md), "What the list suggests").

## Setting up a phone

Settings, Capture, "Set up capture" lists the steps and checks that the first payment arrived. On `npm run dev` the
demo data has no capture routes behind it, so the review list read fails silently and these cards say "Request failed";
that is expected, and production and the staging previews have the routes. **A shortcut built by hand
from steps like these worked on one phone, and the shortcut installed from a shared copy worked on one phone. A second
phone has not been tried.** We have not seen the iOS 27 screens beyond the trigger, so names below may differ from
yours; report any that do. The steps are the same for every bank app.

Only an iPhone or iPad runs Shortcuts automations, so the card reads the platform from the browser (`src/config/device.ts`;
an iPad that calls itself a Mac is told apart by its touch screen). On an iPhone, an iPad or a device it cannot place it
shows the steps, the check and a line saying the trigger is proven on iOS 27 and untested on older versions. On Android,
a Mac, Windows or Linux it shows only a note to set capture up from Settings on the iPhone or iPad, with no steps and no
status read; the key card, the linked cards, muted pushes and diagnostics show everywhere, since a person often reviews
on a laptop. Nothing is blocked. The OS version is never read from the browser, because Safari freezes it in the user
agent, so the requirement line points to Settings, General, About instead.

The steps fold behind "Show the steps" / "Hide the steps", a row that also says how many are ticked. They start open
until a payment has been captured from any source and closed after that, so a person whose capture works reaches the
check and the cards under it without scrolling past the steps. Once the person opens or closes them, that choice is
kept in the browser with the ticks and wins over the default. The check stays outside the fold.

### With the shortcut link

With a valid `CAPTURE_SHORTCUT_URL`, `GET /api/capture-status` reports it as `shortcutUrl` and the card shows these
steps. "Add the shortcut" is a plain link (`target="_blank"`) that opens Shortcuts' Add Shortcut page, verified on one
iPhone from Safari and the installed Home Screen app. A link to the file traps the installed app in iOS's file preview;
`shortcuts://import-shortcut` and the Web Share API do not work there.

1. **Make a key and copy it.** In **Capture key**, type a name and tap **Make a key**. Tap **Copy** at once: it is shown once.
2. **Add the shortcut.** Tap **Add the shortcut**. Shortcuts opens its Add Shortcut page in a new window. Tap **Add
   Shortcut**, then come back to the app.
3. **Choose your bank's app.** In the trigger **When I receive a notification from**, tap the app name and choose the app.
4. **Paste your key.** In the header **Authorization**, replace `KEY_HERE` with the key. Keep `Bearer` and its space in
   front. Leave no empty row under **Headers**: an empty header makes Cloudflare refuse the request with its own 400
   before the Worker sees it, so the app can neither count nor log it.
5. **Check the app field.** The JSON's `app` field holds the notification's **App** variable, which the Worker folds into
   the source word ([CAPTURE-SHAPES.md](CAPTURE-SHAPES.md)), so nothing is typed. A copy published before that has a
   `source` field holding `CARD_NAME_HERE` instead: delete it and add `app`. A shortcut that sends a real `source`
   word keeps working, and that word wins over `app`, so its payments and cards stay filed where they were.
6. **Check the automation is on.** A shared shortcut can arrive with its automation off (untried). Keep **Automation** on and turn on
   **Allow Running When Locked** (info button, Privacy). Notify was off on the automations tried; whether it matters is
   untried. The editor has said "Automation is turned off" while it ran, so trust the automation list and the first payment.
7. **Make one purchase** and watch the check below. If iOS asks whether the shortcut may send data, allow it and choose
   the option that remembers the answer. If it asks again on every payment an unattended run cannot work yet (untested).

The Worker's address, with `/capture`, is already inside the file (checked), so none is typed.

### Publishing the shortcut

The shortcut is signed by Apple, so it cannot be edited per person, and the file is never committed. The copy in the
app-files bucket (`shortcuts/capture.shortcut`, [APP-FILES.md](APP-FILES.md)) is the keyless master copy, still served
by `GET /api/capture-shortcut` but not linked from the card. Publish it once per environment:

1. Build the shortcut as in "By hand", trigger app unchosen, header `Bearer KEY_HERE`, JSON `app` set to the App variable
   and no `source` field.
   Export it as a file and upload it to the bucket as the master copy:
   `wrangler r2 object put expense-tracker-app-files/shortcuts/capture.shortcut --remote --file ./Expense\ capture.shortcut --content-type application/octet-stream`
2. The link must come from a clean import of that keyless file, with `KEY_HERE` untouched, never
   from a copy that already holds a real key. Import it into Shortcuts, then Share, **Copy iCloud Link**.
3. In the Cloudflare dashboard open the Pages project, Settings, Variables and Secrets, add `CAPTURE_SHORTCUT_URL`
   as plain text to both Production and Preview, repeat on the separate staging Pages project, then redeploy.
4. When you replace a link, **Stop Sharing** the old one in Shortcuts (Share).

The link is public: it holds only the placeholders and the baked Worker address (not a secret), never a key, and is never
committed. Unset or invalid, the status route says `shortcutUrl: null` and the card shows the manual steps.

### By hand

With no valid link set, or when the status cannot be read, the card shows these steps, one action each. The address is
`endpoint` from `GET /api/capture-status` with a Copy button, or a field to paste it.

1. Make a key and copy it, as above.
2. Open **Shortcuts**, start a new automation and choose the trigger **When I receive a notification from**.
3. Tap the app name and choose the bank's app. Leave the filters empty.
4. Tap the **Search** bar at the bottom, type **Get Contents of URL** and tap that action to add it.
5. In the action, tap **URL** and type the address. The `/capture` is part of it.
6. Tap the small arrow on the action to show more. Change **Method** from GET to **POST**.
7. Under **Headers**, tap **Add new header**. Set the key to **Authorization** and the text to `Bearer`, a space, then the
   key. Leave no empty row there, as in step 4 above.
8. Under **Request Body**, choose **JSON**.
9. Tap **Add new field**, choose **Text**, set the key to **app** and, from the value field, the notification's variable
   **App**. Nothing is typed for the bank.
10. Add a field the same way with the key **title** and, from the value field, the notification's variable **Title**.
11. Add a field with the key **body** and the variable **Body**.
12. Add a field with the key **date** and the variable **Date**. Tap the variable once more and look for a date format called
    **ISO 8601**. In saved notes the date arrived that way, such as `2026-11-03T09:41:07+01:00`.
13. Save the automation. Optional: an If that checks the answer contains `ok`, otherwise shows "Capture failed" (untried: the
    action returns the answer rather than failing, so it can catch a refusal but probably not a missing connection).
14. Check the automation is on, and make one purchase, as steps 6 and 7 above.

**The check.** The screen reads `GET /api/capture-status` and shows one of four states for every source together: the
counts added up, and the newest capture with the source it came from. Grey "Waiting for your first payment": nothing has
reached the app. Amber "Arriving, not read as a payment": pushes arrived over the last
seven days (`capture_counters.received`) and every one went unread (`unrecognised` equals `received`), or none ever
was read, which is what a shortcut sending the wrong fields, or only muted wordings, looks like. Amber "Nothing captured
lately": the newest stored push (`capture_events`) is more than 3 days old (`STALE_DAYS` in `captureSetup.ts`). Green "Last payment captured",
with the time, otherwise, and with "N of M unread in the last 7 days" when some pushes were unread. In any state, when
requests from the person's keys over the last week could not be read (`malformed`), it says how many and to check the
shortcut's fields, in place of "nothing has reached the app", and that a bank app whose name has no Latin letters or
digits needs a typed `source` field. While the read is out the card says only "Checking", and when it fails it shows the error alone, never a claim about the phone. It is information only: there is no banner, reconciliation or notification, so a stopped
automation is noticed only by the person.

The address is the `CAPTURE_ENDPOINT` Pages variable of the environment, a plain variable holding the Worker's address.
The hostname is private, so it is never committed; docs and tests use `https://capture.example.workers.dev`. Where the
variable is unset the screen asks for the address to be pasted and keeps it in that browser only.

## Muted pushes and diagnostics

Settings, Capture has two more cards, each its own lazy chunk. "Muted pushes" reads
`GET /api/capture-templates?ignored=1` and lists each muted wording by its masked words: numbers, cards, dates and codes
always shown as what they are, and the merchant only once a second push of the wording has shown where it sits (until
then the first push's merchant is among the words), with its source, how often it was seen and dismissed, and when it
was muted; "Suggest again" calls the un-ignore route and reads the list again. "Capture diagnostics" reads the status
route's `diagnostics` and shows, per source, every count (a push that joined another's recommendation as "Same payment
as another") and three shares of the decided recommendations: added as
shown, edited, and dismissed. A link counts as decided, so the three need not add up to 100. The diagnostics card quotes no push.

## The capture endpoint

The Worker that accepts pushes, its refusals, what it stores and how to deploy and read it: [CAPTURE-WORKER.md](CAPTURE-WORKER.md).
