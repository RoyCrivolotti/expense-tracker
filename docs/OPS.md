# Dev staging — expense-tracker

Full chain: **stg.crivolotti.com** (landing) → **stg-admin** (admin hub) → **stg-expenses** + **stg-oncall**.

| URL | Pages project | Role |
| --- | --- | --- |
| https://stg.crivolotti.com | `roy-dev` | Public landing (staging banner) |
| https://stg-admin.crivolotti.com | `roy-private` | Admin hub + reports (Access) |
| https://stg-expenses.crivolotti.com | `roy-expenses-stg` | Expense SPA + API (Access) |
| https://stg-oncall.crivolotti.com | `roy-oncall-stg` | On-call SPA + API (Access) |

Private staging surfaces use the **roy-admin-staging** Cloudflare Access app (Google login). Production uses **roy-admin** only (`roy-admin.crivolotti.com`, `expenses.crivolotti.com`, `oncall.crivolotti.com`). Hostname registry: `config/staging-access.json`.

## One-time setup

### 1. Pages projects + D1 bindings

Each heading below names the repo the commands are run **from**. Only the
**expense-tracker** ones exist in this repo; the rest live in their own.

**expense-tracker**

1. `wrangler d1 create roy-expenses-dev` → copy id to `config/dev.json`
2. `npm run setup:staging-project` (creates `roy-expenses-stg`, binds D1)
3. `npm run seed:dev` (empty DB; **do not** run `migrate:dev` first)

**oncall-tracker**

1. `wrangler d1 create roy-oncall-dev` → copy id + roy-expenses-dev access id into `config/dev.json`
2. `npm run setup:staging-project` (creates `roy-oncall-stg`, binds D1)

**admin-hub**

1. `npm run setup:staging-bindings` (D1 → roy-expenses-dev, OWNER_EMAIL)
2. `npm run deploy:staging` → `roy-private` Pages project

**landing**

1. `npm run deploy:staging` → `roy-dev` Pages project

### 2. Custom domains + DreamHost DNS

From **expense-tracker** (registers domains in Pages + prints CNAME table):

```bash
npm run setup:staging-domains
```

Then add the printed CNAME records in DreamHost (one per staging hostname above).

### 3. Cloudflare Access (two apps)

```bash
CLOUDFLARE_API_TOKEN=… npm run setup:access-apps      # create/sync roy-admin-staging + prod hostnames
CLOUDFLARE_API_TOKEN=… npm run setup:access-google -- --app roy-admin-staging
CLOUDFLARE_API_TOKEN=… npm run setup:access-migrate   # remove legacy pages.dev hostnames from roy-admin
```

Token needs **Zero Trust → Access → Edit**. Wrangler OAuth alone cannot do this.

### 4. Deploy staging builds

```bash
# expense-tracker, oncall-tracker, admin-hub, landing
npm run deploy:dev   # or deploy:staging for hub/landing
```

Sign in once at any staging Access hostname; cookie applies across all three private staging URLs.

## CSV import format

Transaction import expects the same header as export (see `src/domain/data/exportCsvFormat.ts`):

`id,date,budget_month,description,category,account,type,amount_cents,status,cancelled,notes`

- **category** / **account**: must match existing names exactly.
- **type**: `expense`, `income`, `investment`, or `refund`.
- **amount_cents**: integer cents, positive; an `investment` may be negative for money taken back out of the portfolio.
- **date** / **budget_month**: ISO `YYYY-MM-DD` and `YYYY-MM`.
- Easiest path: Settings → Data → Export, edit the CSV, then Import.

Settings → Data → Import includes a **Download template** with the header and one example row.

### Investment withdrawals

A negative `amount_cents` on an `investment` row is money taken back out of the portfolio: a
sale to cash, a dividend paid out. The transaction form records it as Withdraw. Every other
type stays positive. The rule lives in `src/domain/data/amountSign.ts`; the application
layer applies it to a payload that carries both fields, and the D1 adapter checks a patch
that carries only one of them against the stored row, and refuses a bulk type change away
from `investment` while any target row is a withdrawal.

### Migrations

The Deploy workflow applies pending migrations to dev and then prod before it deploys the code
(see [DEPLOYMENT.md](./DEPLOYMENT.md)). `npm run migrate:status` shows what each is missing,
and the PR preview workflow prints the same. The first merge after this landed applies anything
not yet recorded, so read that output first: a file that was applied by hand but never recorded
would be applied again, fail on the duplicate column, and stop the deploy until its row is
inserted. The script refuses to run at all when a database's record has a hole below its
highest entry, which is the usual shape of a forgotten row.

## Scripts (expense-tracker)

| Script | npm alias | Purpose |
| --- | --- | --- |
| `scripts/setup-staging-project.mjs` | `setup:staging-project` | Create `roy-expenses-stg` + D1 bindings |
| `scripts/setup-staging-domains.mjs` | `setup:staging-domains` | Register custom domains; print DreamHost CNAMEs |
| `scripts/setup-access-apps.mjs` | `setup:access-apps` | Sync prod + staging Access apps |
| `scripts/setup-access-migrate.mjs` | `setup:access-migrate` | Strip staging hostnames from `roy-admin` |
| `scripts/setup-dev-bindings.mjs` | `setup:dev-bindings` | Re-apply D1 bindings on `roy-expenses-stg` |
| `scripts/seed-dev.mjs` | `seed:dev` / `seed:dev-from-prod` | Prod D1 export → dev (`.tmp/` gitignored); private QA only |
| `scripts/seed-demo-staging.mjs` | `seed:demo-staging` | Synthetic demo tenant on `roy-expenses-dev` (public fixtures) |
| `scripts/migrate.mjs` | `migrate:status` / `migrate:dev` | Apply pending migrations, recording each; the Deploy workflow runs it for dev and prod (dev by hand only after a seed) |
| `scripts/deploy-dev.sh` | `deploy:dev` | Deploy to `roy-expenses-stg` |

PRs on expense-tracker run `.github/workflows/deploy-dev.yml`.

## Staging demo account (portfolio try-it)

Shared Google account for reviewers (`expenses.tracker.demo@gmail.com` by default). Data lives in `fixtures/demo-staging-expenses.csv` (Jan–Jun ledger) and `fixtures/demo-staging-goal-scenarios.json` (four saved scenarios).

**One-time / reset:**

```bash
unset CLOUDFLARE_API_TOKEN
npm run seed:demo-staging
```

This allowlists the demo email on `roy-expenses-dev`, grants the `expenses` group, and loads synthetic data for that owner only. Other staging users are untouched.

**Share with visitors:** link to https://stg-expenses.crivolotti.com and the demo Google credentials (store in 1Password; never commit passwords).

To use a different demo email: `DEMO_EMAIL=you@example.com npm run seed:demo-staging`.

## Statement `paid_on` history (backfill removed, July 2026)

Legacy rows could have `paid = 1` with `paid_on IS NULL`. A one-time `backfill-statement-paid-on.ts` script filled those in by *guessing* a date per account (e.g. "day 15 of the month after the budget month" for Iberia). That inference logic has since been deleted — `paid_on` is now always user-authored: flipping a statement to paid sets it to today's date (or whatever the user picks), full stop. No code in this repo infers a bank's payment date.

The Iberia guess itself was wrong: `inferIberiaPaidOn` used `nextBudgetMonth(budgetMonth)` instead of the budget month itself, so all 6 backfilled Iberia Icon rows (Jan–Jun 2026) landed one calendar month late (e.g. the April statement showed `paid_on = 2026-05-15` instead of `2026-04-15`). This surfaced as duplicate-looking Iberia rows in Transactions. Corrected via a narrow one-off script (`correct-iberia-paid-on.ts`, deleted after use) that asserted each row's current value matched the exact known-bad pattern before overwriting it — nothing else was touched.

If a future migration ever needs a similar one-time backfill, don't resurrect date-guessing: default new `paid=1` rows to `todayLocalIso()` and let the user correct the date manually, same as the live UI does.

## Currency, number format & budget months

Three per-owner `settings` columns (nullable, migration `0011`) generalise the tracker beyond one owner's euros-and-13th conventions: `currency_code`, `number_locale`, and `budget_rollover_day`. `NULL` on any of them falls back to built-in defaults (EUR, `de-DE` grouping, rollover day 1). They are set during onboarding (the "Money & months" step) and editable under Settings → Money & months.

Display is driven by a resolved `MoneyFormat` (`resolveMoneyFormat(currencyCode, numberLocale)`) provided app-wide via `MoneyFormatProvider`; components read it with `useMoneyFormat()` while pure helpers (`formatCents`, `formatMoneyInput`, `parseMoneyToCents`) take a `MoneyFormat` argument. Money inputs are free-text with `inputMode="decimal"` so a comma-decimal locale is not rejected by a numeric field.

`budget_rollover_day` (1–28) sets the day a new transaction starts counting toward the next budget month. `defaultBudgetMonth(isoDate, rolloverDay)` applies it; day 1 means plain calendar months. It threads through the transaction form defaults, the date field, statement-add seeds, and the non-monthly fallback in `detectRecurring` (monthly recurring patterns still use each group's learned offset). The primary owner keeps the historical day-13 rollover via the migration's final `UPDATE` (replace the placeholder email with the real Access email before applying).

The cash reconciliation table derives a never-stored `reconciled` flag per month (`actualCashCents !== null && unpaidLiabilityCents === 0`) and shows a ✓ badge; it does not block editing.

## Installment plans

An installment plan models one bounded purchase split into a fixed number of equal monthly payments (e.g. a phone financed over 24 months), distinct from recurring detection which infers patterns. A plan lives in `installment_plans` (owner-scoped, migration `0009`); each recorded payment is a normal transaction carrying `plan_id` + `installment_index`. The index is assigned server-side from recorded progress on write (insert, or link/move on update); the duplicate check excludes the row being saved so a linked row can be re-saved at its own index. A partial unique index (`owner, plan_id, installment_index`) blocks duplicates. Plan-linked transactions are excluded from recurring suggestions.

Schedule anchoring: `anchor_budget_month` is the budget month of `start_installment_index`; every other installment's budget month is that anchor shifted by the index offset. `start_installment_index` is 1 for a fresh plan, higher when importing a plan already in flight.

Due day: `due_day_of_month` (nullable, migration `0010`) is the day of the month a payment posts to the card. A new plan captures it automatically from the day of the logging transaction; you can set or correct it on the plan edit form (leave blank to clear). It is the charge day, not the day the card's bill is paid: a card that debits on the 1st can carry a plan whose charge day is the 6th. It clamps to the month length (day 31 in a 30-day month becomes the 30th). Legacy plans with `NULL` are treated as "unknown day": a suggested or auto-created payment is dated the 1st of its budget month and the card reads "Due this month".

Payment dates: a payment's calendar date is its budget month shifted back by the gap the plan's earliest recorded installment shows between its own date and its budget month (`calendarOffsetMonths`, ignored past one month as a likely typo). An owner who counts a charge in the month its card bill is paid therefore gets a first installment dated in August and counted in September, then one dated in September and counted in October, without configuring anything. With nothing recorded yet, or no gap in the first row, the date falls in the budget month. The same date is used for the Due text, the `+` seed, and the rows created automatically for credit-card plans.

The Transactions tab is the single home for installments. Creating, attaching, moving, or unlinking a plan happens inside the transaction modal (add or edit): the "Installment plan" button swaps the modal body to an installment step where you pick None / New plan / Existing plan (plus Change plan / Remove on an already-linked row). A new plan is derived from the transaction's own fields, anchored to its budget month. Save applies the intent (create-plan-then-link, link, move, or unlink) via the standard create/update endpoints. Settings no longer hosts installments.

Managing plans (progress, edit details, complete/reactivate, delete) lives behind the "Manage plans" button on the Installments card in the Transactions tab, which opens a modal listing every plan with a step-swap edit form. The card shows each active plan's payment for the viewed budget month as one row with one status pill, and the pill carries the date so a row never says its state twice: "Due 12 Jun" (nothing logged yet, with a `+` that opens the add-transaction modal pre-seeded from the plan), "Forecast for Jun" (logged on a card whose statement is unpaid) or "Paid 4 Jun". The pill follows the transaction's derived status, not the account type. Each row also shows the position ("2/24"), a Debit or Credit chip (from the account's settlement type) and the plan's last payment month. A paid debit installment shows its own date, since logging it is the payment; a paid card installment shows the statement's `paid_on`, because the charge date is when it hit the card, not when it was paid. There is no card due date in the app, so a Forecast row names its budget month rather than a day. The card is a size container and the layout follows its own width, not the viewport: a table with column headers on a wide card, two lines on a phone, three lines below 375px so the name still fits, and plain wrapping when a large text size leaves no room even for that (the thresholds are in rem, so they grow with the text). The styles live in `InstallmentsCard.module.css`, separate from the recurring Upcoming card's. It renders whenever any plan exists, so "Manage plans" is always reachable. Only the recurring Upcoming card is windowed to items that are overdue or due within roughly a day.

Automatic creation for credit-card plans: `backfillInstallments` (`functions/_shared/dbInstallmentBackfill.ts`) runs at the start of every dataset load and, for each active plan on a deferred-settlement account, inserts every installment that has come due and isn't recorded, oldest first, up to the owner's current budget month (rollover-aware, on the server's UTC clock). A credit-card installment's charge is a certainty from the day the plan is created, so there is nothing to confirm by hand; a debit-card installment is the only signal the app gets that money left the account, so debit plans stay manual by design. Rows are inserted with `ON CONFLICT DO NOTHING` against the unique index, so concurrent loads never create a duplicate; one plan failing doesn't stop the others, and a failure never fails the load itself. When the final installment exists the plan is marked complete (`maybeCompletePlan`, which also runs after any transaction write that reaches the last installment; migration `0022` closed out plans that had already finished). Deleting an auto-created row gets it re-created on the next load while the plan is active and its month has come due; to stop the schedule, complete or delete the plan.

Linking pre-existing rows: open the row, use the installment step, and attach it to the plan (index defaults to the plan's next open slot, overridable). The original iPhone migration (`plan_id=1`) was a one-off SQL backfill, already applied to prod, and its helper script has since been removed.

## Gitignored local paths

| Path | Purpose |
| --- | --- |
| `samples/` | Personal bank statement samples |
| `reports/` | D1 exports and reconciliation CSVs |
| `.tmp/` | Prod→dev D1 dumps |
| `config/dev.json` | Dev D1 database id |
