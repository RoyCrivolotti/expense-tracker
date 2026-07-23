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

Then add the four CNAME records in DreamHost (see [crivolotti-site README](../crivolotti-site/README.md) DNS table).

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
- **amount_cents**: integer cents, always positive.
- **date** / **budget_month**: ISO `YYYY-MM-DD` and `YYYY-MM`.
- Easiest path: Settings → Export, edit the CSV, then Import.

Settings → Import includes a **Download template** with the header and one example row.

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
| `scripts/migrate-dev.mjs` | `migrate:dev` | Apply new migrations to dev (post-seed only) |
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

## Installment plans

An installment plan models one bounded purchase split into a fixed number of equal monthly payments (e.g. a phone financed over 24 months), distinct from recurring detection which infers patterns. A plan lives in `installment_plans` (owner-scoped, migration `0009`); each recorded payment is a normal transaction carrying `plan_id` + `installment_index`. The index is assigned server-side from recorded progress on write (insert, or link/move on update); the duplicate check excludes the row being saved so a linked row can be re-saved at its own index. A partial unique index (`owner, plan_id, installment_index`) blocks duplicates. Plan-linked transactions are excluded from recurring suggestions.

Schedule anchoring: `anchor_budget_month` is the budget month of `start_installment_index`; every other installment's budget month is that anchor shifted by the index offset. `start_installment_index` is 1 for a fresh plan, higher when importing a plan already in flight.

Due day: `due_day_of_month` (nullable, migration `0010`) records the day within the budget month a payment is due. A new plan captures it automatically from the day of the logging transaction; you can set or correct it on the plan edit form (leave blank to clear). It clamps to the month length (day 31 in a 30-day month becomes the 30th). Legacy plans with `NULL` are treated as "unknown day" and are always shown when their month matches.

The Transactions tab is the single home for installments. Creating, attaching, moving, or unlinking a plan happens inside the transaction modal (add or edit): the "Installment plan" button swaps the modal body to an installment step where you pick None / New plan / Existing plan (plus Change plan / Remove on an already-linked row). A new plan is derived from the transaction's own fields, anchored to its budget month. Save applies the intent (create-plan-then-link, link, move, or unlink) via the standard create/update endpoints. Settings no longer hosts installments.

Managing plans (progress, edit details, complete/reactivate, delete) lives behind the "Manage plans" button on the Installments card in the Transactions tab, which opens a modal listing every plan with a step-swap edit form. The card surfaces the next due installment; tapping `+` opens the add-transaction modal pre-seeded from the plan.

Due-soon windowing: both the Installments and Upcoming cards only render items that are overdue or due within roughly a day (today or tomorrow), rather than everything scheduled for the viewed month. An installment with a known `due_day_of_month` is filtered by its real date; one with an unknown day always shows for its month. Each card hides entirely when its filtered list is empty, so the Installments card (and with it the "Manage plans" entry point) disappears when nothing is due or overdue and reappears when the next payment comes into range.

Linking pre-existing rows: open the row, use the installment step, and attach it to the plan (index defaults to the plan's next open slot, overridable). The original iPhone migration (`plan_id=1`) was a one-off SQL backfill, already applied to prod, and its helper script has since been removed.

## Gitignored local paths

| Path | Purpose |
| --- | --- |
| `samples/` | Personal bank statement samples |
| `reports/` | D1 exports and reconciliation CSVs |
| `.tmp/` | Prod→dev D1 dumps |
| `config/dev.json` | Dev D1 database id |
