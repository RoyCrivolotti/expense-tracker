# The capture endpoint

For a contributor changing the Worker that accepts pushes. How a push becomes a recommendation, and the screens that review it, are in [CAPTURE.md](CAPTURE.md).


`POST /capture` on its own Worker ([`workers/capture`](../workers/capture/src/index.ts)), not a route of the app. It
has a `workers.dev` address, one D1 binding and no receipts bucket, so no `/api` route can accept a capture key and
the app's Access settings are not part of its risk. It never reads the Access headers: the owner is the key's.

Refusals come in this order, and the first five touch no database: wrong path 404, method 405, a key that is not
`Authorization: Bearer xpk_<16 hex>_<64 hex>` 401, a declared size over 16 KB 413, a content type other than JSON 415.
Then one read by key id. Every key problem (unknown id, wrong secret, revoked, owner off the allow-list or without the
Expenses group) is the same 401, byte for byte, and an unknown id still compares against a dummy hash. A body is read
through a counted stream and stops at 16 KB. The body is `{ app, title, body, date }`, with `app` the notification's
App name (at most 64 characters), or `{ source, title, body, date }` from an older shortcut, whose `source` word wins
when it is valid. Anything else, or an `app` that folds to no word, is a fixed 400, and from a valid key it adds one to
that day's `malformed` counter for the key's owner, under the word `-`, which no source can be and which takes no place
in the source cap. The status route reports that count, so the setup card can say the shortcut sends something
unreadable. Source words: [CAPTURE-SHAPES.md](CAPTURE-SHAPES.md), "Source words".

An empty extra row under the shortcut's Headers makes Cloudflare's edge answer its own 400 page before the Worker runs,
so that request is neither counted nor logged. The setup steps warn about it.

What happens to a push:

| Push | Result |
| --- | --- |
| Any push with one amount marked by a currency, readable Date | One event and one open recommendation, in one batch, whatever the bank or the words ([`store.ts`](../workers/capture/src/store.ts)). The amount is positive, the currency is the marker's ISO code, the type is `expense` and the event's `kind` is `push`; the person's decisions on the template correct the rest at list time. The event keeps the push's shape and slots, and the push joins or starts one of the person's templates in the same batch ([CAPTURE-SHAPES.md](CAPTURE-SHAPES.md), "At receipt"). The recommendation's `occurredAt` is the phone's own clock with its offset (`2026-11-03T09:41:07+01:00`), so the app can read the time of day the payment was made. Its `localDate` is the date the push's words name when they name one ([CAPTURE-SHAPES.md](CAPTURE-SHAPES.md), "At receipt"), else the phone's day of arrival; the event keeps the arrival either way. An older row written in UTC (`Z`) has no known offset. Answers `{"ok":true}` |
| A push of the same movement as an open recommendation of the person ([CAPTURE.md](CAPTURE.md), "One movement, one recommendation") | One event that joins that recommendation (`grouped` is 1 on it) and no new recommendation. When the push shows the merchant where its template says it sits and the recommendation's description is a whole earlier push, the description becomes that merchant. Logged as `stored`, reason `grouped` |
| Same push again | Stored once. The same 200 |
| No amount with a currency marker, or two marked amounts that differ (reason `no-amount`; `code-like` when all it holds is a code), a Date it cannot read (`bad-date`), one more than a week old (`too-old`), or one dated more than two days ahead of the clock (`clock-skew`). The phone is still answered 200 for these: the Worker's answers never say why a push was dropped, and an error would show up in the shortcut and in the setup screen's count of unreadable requests | Adds to that day's `unrecognised` counter. Nothing else is kept, not even its shape, so a one-time code leaves no words anywhere |
| A push of a template the person has muted ([CAPTURE.md](CAPTURE.md), "What it learns") | The same: counted as `unrecognised`, and as seen on the template. Logged as `dropped`, reason `ignored-shape`. It is counted before any replay check, so a phone that retries such a push counts it again; nothing is stored, so nothing else changes |
| Over a cap | 429 with `Retry-After`, and nothing stored |

Caps, all checked inside the insert that stores the count or the row, so parallel requests cannot pass them together:
20 pushes an hour and 100 a day per key, 200 pushes a day per person (stored or not), 2,000 a day across everyone,
2,000 open recommendations per person, and 8 different source words per person. They are starting guesses.

Two things are stored under a secret. The replay hash is an HMAC under `CAPTURE_REPLAY_SECRET`, so a stored hash cannot
be matched against a guessed body such as a one-time code. With the secret unset the Worker answers 503 to everything.
Errors answer a fixed 500 and log a fixed line, never text built from a push.

There is no per-address rate limit. A caller with no key who sends a well-formed header costs one hash and one D1 read
per request and cannot write anything. A `workers.dev` address has no zone, so no rate rule can sit in front of it. If
abuse is seen, a Workers Rate Limiting binding is the fix.

## Telling the person

A push that makes a recommendation of its own is announced to the person's devices once the phone has its answer, when
they chose a push per payment ([PUSH.md](PUSH.md), "How the capture Worker sends one"). It runs in `waitUntil` and
catches everything, so it can neither slow nor fail the capture. It needs three more secrets, `VAPID_PRIVATE_KEY`,
`VAPID_PUBLIC_KEY` and `VAPID_SUBJECT`; with any unset the Worker captures exactly as before and logs one
`event: 'push'` line saying `not-configured`. A push that joins an open recommendation and a replay send nothing. For a
person who chose a daily or weekly summary the Worker's hourly cron (`scheduled` in `index.ts`) sends it
([PUSH.md](PUSH.md), "Daily and weekly summaries"); the trigger is in `wrangler.toml` and goes live with a deploy.

## Reading what the Worker did

Each request writes one line to Workers Logs (`[observability]` in `workers/capture/wrangler.toml`), whatever its
outcome: `outcome` (`stored`, `replay`, `dropped`, `refused`, `limited`, `error`), a short `reason` from the closed list
in [`log.ts`](../workers/capture/src/log.ts), the `status` the phone got, the `source` word, the public `keyId`, and
`ms`. A push that joined an open recommendation says `grouped`, and a body it could not read `bad-body`. A dropped push says why: `no-amount`, `code-like`, `bad-date`, `too-old`, `clock-skew` or `ignored-shape` (a muted wording).
A second line, `event: 'push'`, says what became of each announcement (`outcome`, `reason`, `status`, `devices`, `ms`).
Nothing from the push goes in: no title, body, merchant, amount, digits or email, and an error is logged by its class
only. A phone
whose request never shows up here never reached the Worker, which points at the Shortcut rather than the app.

## Deploying it

A merge to `main` deploys both Workers, staging and then production, from the merged commit: the `ship` job in
`.github/workflows/deploy.yml`, after the migrations ([DEPLOYMENT.md](DEPLOYMENT.md), "CI"). It does so on every merge,
because the bundle reaches into `src/domain` and `functions/_shared`.
[`deploy-capture.mjs`](../scripts/deploy-capture.mjs) gives wrangler a git-ignored copy of `wrangler.toml` with the
Worker's name, the account and the database filled in, and names the version after the commit. Secrets and variables set
on the Worker survive a deploy. The Worker's address is private and the Actions log is public, so the script takes
addresses, and the account details wrangler adds to a refused token, out of wrangler's output.
[`check-capture-deployed.mjs`](../scripts/check-capture-deployed.mjs) then asks Cloudflare what each Worker is running,
and fails the job unless it is one version, taking all the traffic, named after that commit, with its environment's
database and `CAPTURE_REPLAY_SECRET` bound. A token that lacks a permission fails the job too.

### When the deploy or its check fails

The job's log names the Worker, the reason and what had already shipped. Both Pages projects deploy before the capture
steps, so they are on the new commit by then. Staging goes first, so a deploy that fails there leaves production on the
version it had. An earlier step of `ship` that fails, the backup cron's included, skips all three capture steps.

Re-run only the newest Deploy run. A re-run deploys that run's own commit, so re-running an older one puts the app and
both capture Workers back on old code, and its check passes because it compares with that commit. If newer commits have
reached `main`, or you are unsure, use **Run workflow** on `main` instead.

If CI cannot deploy, run these from a clean checkout of `main` with `CLOUDFLARE_API_TOKEN` set, after
`npm run migrate -- <database>` shows nothing pending, since the Worker writes columns that migrations add:

```bash
npm run deploy:capture -- staging
npm run deploy:capture -- prod
npm run check:capture
```

To put back the version that ran before, use Deployments in the Worker's dashboard page, or
`npx wrangler rollback <version id> --name expense-capture` (`expense-capture-stg` for staging). It lasts until the next
merge deploys `main` again, so revert the commit as well. A version made by hand, such as by changing a secret, may name
no commit; the next deploy replaces it.

### A new environment

CI keeps existing Workers current. Setting one up changes Cloudflare and needs the account owner's say-so, staging first.

1. Create its D1 database and apply the migrations. The Worker and database names are in `deploy-capture.mjs`.
2. `npm run deploy:capture -- staging` creates the Worker and binds the database as `DB`.
3. `npx wrangler secret put CAPTURE_REPLAY_SECRET --name <worker>` with 32 random bytes of hex, one per environment.
   Until it is set the Worker answers 503.
4. Set `OWNER_EMAIL` to the same value the app uses, as a secret or variable and never committed. The owner reaches
   the app without an Expenses grant only through it, so without it the owner's own key is refused. Anyone else
   needs a grant either way.
5. To send notifications, set the three VAPID secrets as [PUSH.md](PUSH.md), "Setting it up", describes. Without them
   the Worker works and tells nobody.
6. Send a staging key's POST from a shell and check: valid key 200, wrong key 401, the same key to the app's
   `/api/expenses` 401.
7. Deploy once more, so the version running names its commit.
8. Repeat for production.
