# Staging — expense-tracker

Staging is a second Pages project (`<your-staging-project>`) with its own D1 database (`<your-dev-d1-database>`), hostname and Cloudflare Access application, so a change can be tried on Cloudflare without touching production. The names and hostnames the setup scripts use are in `config/staging-access.json` and `config/dev.json` (copy `config/dev.example.json`).

## One-time setup

### 1. Pages project + D1 binding

1. `wrangler d1 create <your-dev-d1-database>` → copy id to `config/dev.json`
2. `npm run setup:staging-project` (creates the staging Pages project, binds D1)
3. `npm run seed:dev` (empty DB; **do not** run `migrate:dev` first)

### 2. Custom domain + DNS

```bash
npm run setup:staging-domains   # registers the domain in Pages and prints the CNAME table
```

Then add the printed CNAME record at your DNS host.

### 3. Cloudflare Access (two applications)

```bash
CLOUDFLARE_API_TOKEN=… npm run setup:access-apps      # create/sync the staging and production applications' hostnames
CLOUDFLARE_API_TOKEN=… npm run setup:access-google -- --app <your-staging-access-app>
CLOUDFLARE_API_TOKEN=… npm run setup:access-migrate   # remove legacy pages.dev hostnames from the production application
```

Token needs **Zero Trust → Access → Edit**. Wrangler OAuth alone cannot do this.

### 4. Deploy a staging build

```bash
npm run deploy:dev
```

Sign in once at any hostname of the staging Access application; the cookie applies to the others.

## CSV import format

Transaction import expects the same header as export (see `src/domain/data/exportCsvFormat.ts`):

`id,date,budget_month,description,category,account,type,amount_cents,status,cancelled,notes`

- **category** / **account**: must match existing names exactly.
- **type**: `expense`, `income`, `investment`, or `refund`.
- **amount_cents**: integer cents, positive; an `investment` may be negative for money taken back out of the portfolio.
- **date** / **budget_month**: ISO `YYYY-MM-DD` and `YYYY-MM`, and a real day and month (`2025-02-30` and `2025-13` are refused).
- **description**: text of at most 140 characters, which an import, a new transaction and an edit all hold to. The server
  refuses a whole import with the row number when one row breaks a rule.
- Easiest path: Settings → Data → Export, edit the CSV, then Import.

Settings → Data → Import includes a **Download template** with the header and one example row.

### Investment withdrawals

A negative `amount_cents` on an `investment` row is money taken back out of the portfolio: a
sale to cash, a dividend paid out. The transaction form records it as Withdraw. Every other
type stays positive. The rule lives in `src/domain/data/amountSign.ts`; the application
layer applies it to a payload that carries both fields, and the D1 adapter checks a patch
that carries only one of them against the stored row, and refuses a bulk type change away
from `investment` while any target row is a withdrawal.

### Applying migrations

A merge to `main` applies a migration: dev automatically, then production once the `production`
environment is approved in GitHub, and only then does the code that needs it ship (see
`docs/DEPLOYMENT.md`). A PR's preview deploy applies nothing and uses the dev database, so a preview
of a change that adds a column fails to save until dev has had it (`npm run migrate:dev`). To apply
one by hand, `npm run migrate -- <database> --apply`. Reading is safe without a column: a missing
one reads as its default. A dev database that has a column `main` does not make fails the deploy's
schema job on `EXTRA <column>` and so stops every deploy to `main` until that migration is merged:
apply a migration to dev ahead of its merge only when the merge is near.

## Scripts (expense-tracker)

| Script | npm alias | Purpose |
| --- | --- | --- |
| `scripts/setup-staging-project.mjs` | `setup:staging-project` | Create the staging Pages project + D1 bindings |
| `scripts/setup-staging-domains.mjs` | `setup:staging-domains` | Register custom domains; print the CNAMEs to add at your DNS host |
| `scripts/setup-access-apps.mjs` | `setup:access-apps` | Sync prod + staging Access apps |
| `scripts/setup-access-migrate.mjs` | `setup:access-migrate` | Strip staging hostnames from the production Access application |
| `scripts/setup-dev-bindings.mjs` | `setup:dev-bindings` | Re-apply D1 bindings on the staging project |
| `scripts/seed-dev.mjs` | `seed:dev` / `seed:dev-from-prod` | Prod D1 export → dev (`.tmp/` gitignored); private QA only |
| `scripts/seed-demo-staging.mjs` | `seed:demo-staging` | Synthetic demo tenant on the dev database (public fixtures) |
| `scripts/migrate.mjs` | `migrate`, `migrate:dev` | Check any database against `migrations/`, or apply what it lacks (`migrate:dev`: dev, post-seed only) |
| `scripts/deploy-dev.sh` | `deploy:dev` | Deploy to the staging project |

PRs on expense-tracker run `.github/workflows/deploy-dev.yml`.

## Staging demo account

A shared Google account for reviewers, set with `DEMO_EMAIL` (the default is in `scripts/seed-demo-staging.mjs`). Data lives in `fixtures/demo-staging-expenses.csv` (Jan–Jun ledger) and `fixtures/demo-staging-goal-scenarios.json` (four saved scenarios).

**One-time / reset:**

```bash
unset CLOUDFLARE_API_TOKEN
npm run seed:demo-staging
```

This allowlists the demo email on the dev database, grants the `expenses` group, and loads synthetic data for that owner only. Other staging users are untouched.

**Share with visitors:** link to your staging hostname and the demo Google credentials (keep them in a password manager; never commit passwords).

To use a different demo email: `DEMO_EMAIL=you@example.com npm run seed:demo-staging`.

## Statement `paid_on`

`paid_on` is always user-authored: flipping a statement to paid sets it to today's date (or whatever the user picks), full stop. No code in this repo infers a bank's payment date, because a guessed date was wrong for a whole account once and the rows had to be corrected by hand.

If a future migration needs a one-time backfill of `paid_on`, don't guess: default new `paid = 1` rows to `todayLocalIso()` and let the user correct the date, as the live UI does.

## Currency, number format & budget months

Three per-owner `settings` columns (nullable, migration `0011`) generalise the tracker beyond a single currency and calendar-month convention: `currency_code`, `number_locale`, and `budget_rollover_day`. `NULL` on any of them falls back to built-in defaults (EUR, `de-DE` grouping, rollover day 1). They are set during onboarding (the "Money & months" step) and editable under Settings → Money & months.

Display is driven by a resolved `MoneyFormat` (`resolveMoneyFormat(currencyCode, numberLocale)`) provided app-wide via `MoneyFormatProvider`; components read it with `useMoneyFormat()` while pure helpers (`formatCents`, `formatMoneyInput`, `parseMoneyToCents`) take a `MoneyFormat` argument. Money inputs are free-text with `inputMode="decimal"` so a comma-decimal locale is not rejected by a numeric field.

`budget_rollover_day` (1–28) sets the day a new transaction starts counting toward the next budget month. `defaultBudgetMonth(isoDate, rolloverDay)` applies it; day 1 means plain calendar months. It threads through the transaction form defaults, the date field, statement-add seeds, and the tag on an Upcoming suggestion that files under another month than the one on screen (the suggestion's own budget month comes from the series' learned offset). The migration's final `UPDATE` sets a day-13 rollover for the placeholder owner (see `docs/DEPLOYMENT.md`, the `0011` note).

The cash reconciliation table derives a never-stored `reconciled` flag per month (`actualCashCents !== null && unpaidLiabilityCents === 0`) and shows a ✓ badge; it does not block editing.

## Installment plans

An installment plan models one bounded purchase split into a fixed number of equal monthly payments (e.g. a phone financed over 24 months), distinct from recurring detection which infers patterns. A plan lives in `installment_plans` (owner-scoped, migration `0009`); each recorded payment is a normal transaction carrying `plan_id` + `installment_index`. The index is assigned server-side from recorded progress on write (insert, or link/move on update); the duplicate check excludes the row being saved so a linked row can be re-saved at its own index. A partial unique index (`owner, plan_id, installment_index`) blocks duplicates. Plan-linked transactions are excluded from recurring suggestions.

Schedule anchoring: `anchor_budget_month` is the budget month of `start_installment_index`; every other installment's budget month is that anchor shifted by the index offset. `start_installment_index` is 1 for a fresh plan, higher when importing a plan already in flight.

Due day: `due_day_of_month` (nullable, migration `0010`) is the day of the month a payment posts to the card. A new plan captures it automatically from the day of the logging transaction; you can set or correct it on the plan edit form (leave blank to clear). It is the charge day, not the day the card's bill is paid: a card that debits on the 1st can carry a plan whose charge day is the 6th. It clamps to the month length (day 31 in a 30-day month becomes the 30th). Legacy plans with `NULL` are treated as "unknown day": a suggested or auto-created payment is dated the 1st of its budget month and the card reads "Due this month".

Payment dates: a payment's calendar date is its budget month shifted back by the gap the plan's earliest recorded installment shows between its own date and its budget month (`calendarOffsetMonths`, ignored past one month as a likely typo). An owner who counts a charge in the month its card bill is paid therefore gets a first installment dated in August and counted in September, then one dated in September and counted in October, without configuring anything. With nothing recorded yet, or no gap in the first row, the date falls in the budget month. The same date is used for the Due text, the `+` seed, and the rows created automatically for credit-card plans.

The Transactions tab is the single home for installments. Creating, attaching, moving, or unlinking a plan happens inside the transaction modal (add or edit): the "Installment plan" button swaps the modal body to an installment step where you pick None / New plan / Existing plan (plus Change plan / Remove on an already-linked row). A new plan is derived from the transaction's own fields, anchored to its budget month. Save applies the intent (create-plan-then-link, link, move, or unlink) via the standard create/update endpoints. Settings no longer hosts installments.

Managing plans (progress, edit details, complete/reactivate, delete) lives behind the "Manage plans" button on the Installments card in the Transactions tab, which opens a modal listing every plan with a step-swap edit form. The card shows each active plan's payment for the viewed budget month as one row with one status pill, and the pill carries the date so a row never says its state twice: "Due 12 Jun" (nothing logged yet, with a `+` that opens the add-transaction modal pre-seeded from the plan), "Forecast for Jun" (logged on a card whose statement is unpaid) or "Paid 4 Jun". The pill follows the transaction's derived status, not the account type. Each row also shows the position ("2/24"), a Debit or Credit chip (from the account's settlement type) and the plan's last payment month. A paid debit installment shows its own date, since logging it is the payment; a paid card installment shows the statement's `paid_on`, because the charge date is when it hit the card, not when it was paid. There is no card due date in the app, so a Forecast row names its budget month rather than a day. The card is a size container and the layout follows its own width, not the viewport: a table with column headers on a wide card, two lines on a phone, three lines below 375px so the name still fits, and plain wrapping when a large text size leaves no room even for that (the thresholds are in rem, so they grow with the text). The styles live in `InstallmentsCard.module.css`, separate from the recurring Upcoming card's. It renders whenever any plan exists, so "Manage plans" is always reachable. Only the recurring Upcoming card is windowed, see below.

Automatic creation for credit-card plans: `backfillInstallments` (`functions/_shared/dbInstallmentBackfill.ts`) runs at the start of every dataset load and, for each active plan on a deferred-settlement account, inserts every installment that has come due and isn't recorded, oldest first, up to the owner's current budget month (rollover-aware, on the server's UTC clock). A credit-card installment's charge is a certainty from the day the plan is created, so there is nothing to confirm by hand; a debit-card installment is the only signal the app gets that money left the account, so debit plans stay manual by design. Rows are inserted with `ON CONFLICT DO NOTHING` against the unique index, so concurrent loads never create a duplicate; one plan failing doesn't stop the others, and a failure never fails the load itself. When the final installment exists the plan is marked complete (`maybeCompletePlan`, which also runs after any transaction write that reaches the last installment; migration `0022` closed out plans that had already finished). Deleting an auto-created row gets it re-created on the next load while the plan is active and its month has come due; to stop the schedule, complete or delete the plan.

Linking pre-existing rows: open the row, use the installment step, and attach it to the plan (index defaults to the plan's next open slot, overridable).
## Recurring suggestions (Upcoming card)

`detectUpcoming` lists the monthly charges that are due today and not yet logged. It reads the dates of a series' own charges and never the budget month on screen, so the same charges are due whichever month the Transactions tab shows. The tab (`useUpcoming`) offers them above the month today falls in and above the newest month with data, which differ for a few days around the rollover, and not above an older month that is being looked back at.

**Which series.** Transactions are grouped by description, account, category and type (`groupTransactions`, which the Analytics fixed-cost split shares). A group is a series when it has at least three occurrences, a median gap of 25 to 37 days and at least 60% of its gaps near that median. Installment-plan payments and cancelled rows are left out. Weekly, quarterly and yearly patterns are recognised (`classifyFrequency`) but not suggested: none reaches the card.

**The next charge.** The usual date comes from the newest three charges (`PREDICT_HISTORY`): the day of month, plus a few days either side of it for a charge that moves between the end of one month and the start of the next, so a billing day that has moved is followed after two charges and one odd row cannot pull it. The series is waiting for the first usual date that no logged charge covers. A charge covers a date when it was logged from the start of the date's window on, or up to 14 days before the date (`LOGGED_EARLY_WITHIN_DAYS`), whichever budget month it was booked to. So a bill logged on the 3rd for the 10th, or a card's own "+" saved with an earlier date typed in, does not bring the card back, even though the add form works the budget month out again from the date. Half a month back or more, a row is nearer the previous usual date, or an adjustment, and does not hide the next reminder. The suggestion is filed under the series' own booking habit, the median offset of its newest three charges applied to the month of the date, so a pay date that rolls into the next budget month is filed there.

**When it shows.** From `leadDays` before the usual date: one day, plus how early the newest five charges landed before the usual day (`WINDOW_HISTORY`), capped at four more. Earliness is measured around the nearest occurrence of the day, so a charge billed on the 31st or the 1st counts as a day apart. The card keeps it until the charge is logged, it is dismissed, or it is 7 days past its date (`OVERDUE_EXPIRY_DAYS`). Most charges are logged within a day or two, so one still missing after a week is more likely a series that stopped than an entry that was forgotten, and a longer wait mostly shows cancelled subscriptions. A charge logged 8 to 10 days late has had a card for the week before it, but none when it is logged.

**Missed charges.** The card waits for two charges (`EXPECTED_CHARGES`): the next one and, if that one never gets logged, the one after it. Forgetting an entry therefore does not silence the following month's reminder, and a series with two charges missing in a row has stopped and leaves the card. The price is that a subscription you cancel is offered for its next two charges before it goes, each for the window before its date plus up to a week after it (usually 9 to 13 days). Logging the missing charges at any time brings the series back.

**Rows and a long card.** Each row says how its date falls against today ("Due today", "Due tomorrow", "Due in 3 days", "Due yesterday", "Due 2 days ago"), with the date after it, a late one in the warning colour and today's in bold (`dueLabel`). Up to four rows are shown in full. From five the card keeps the first three in view and folds the rest behind a "Show N more" button (N is at least 2, since one row is never worth a toggle), by the same fold the day groups in the list use, so the list below is not pushed off a phone screen.
**Tag and "+".** A suggestion that files under another budget month than the one on screen carries a tag ("For Oct"), and its "+" adds it to that month on its own date. Editing the date in the form that opens works out the budget month again from the new date. The "x" hides the suggestion for its month and offers an Undo. Dismissals are kept in the browser's local storage, per device, under the description, account, category, type and budget month (a key saved without the category and type still applies).

**Stopping a series.** The no-entry button next to "x" stops suggesting a whole series, where "x" only hides one month's charge. It is kept on the device (`useStoppedSuggestions`, in local storage) as the series' identity (`seriesKey`: description, account, category and type) and the date of its newest charge at the time. `detectUpcoming` leaves the series out until a charge dated after that is logged, so a subscription you start again comes back by itself, and an older charge logged late does not bring it back. A series that starts again but is never logged stays stopped. The toast after stopping has an Undo, and "Suggestions you stopped" under Settings, Preferences lists what is stopped on this device with a "Suggest again" button, and leaves out a series that has come back because a newer charge was logged (`stillStopped`). Stopping a series changes nothing in Analytics, where it still counts as a fixed cost. A series whose description changes is a new series. Like dismissals, the list is per device.

**What it does not cover.** The first three charges of a series, since nothing is detected before that. A series whose description changes, or that shares its text with another (two bills under one name). Charges with no regular rhythm. A billing day that has moved: until two charges land on the new day the card still expects the old one, so the first charge on the new day gets no reminder in time. A cadence that is not calendar-monthly, such as every 28 days, which is predicted by day of month and so shows on the wrong days or not at all. Someone who logs charges in a batch more than a week late gets no reminder for them.
## Renaming many descriptions at once

Analytics groups recurring spend by description, so "NETFLIX.COM", "Netflix 0912" and "Netflix"
count as three patterns until they share one name. To merge them:

1. In Transactions, search for the old description. Filters lock once select mode is on, so search first.
2. Widen the date scope (all dates) so every row turns up.
3. Choose **Select**, then **Select all**, then **Edit**.
4. Tick **Description**, type the new name (or pick an existing one) and apply.

The sheet lists the distinct descriptions it is about to replace, because the search matches notes as
well as descriptions and can catch rows you did not mean. Renaming a row linked to an instalment plan
keeps the link but it no longer matches the plan's own description. A reimbursement payment row's
description is the report's name in Past reports, so renaming it renames the report.

## Gitignored local paths

| Path | Purpose |
| --- | --- |
| `samples/` | Personal bank statement samples |
| `reports/` | D1 exports and reconciliation CSVs |
| `.tmp/` | Prod→dev D1 dumps |
| `config/dev.json` | Dev D1 database id |
