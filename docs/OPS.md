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

### 3.5 Legacy pages.dev redirects

After Access migration, route old staging `*.pages.dev` URLs to custom domains via account Bulk Redirects:

```bash
CLOUDFLARE_API_TOKEN=… npm run setup:staging-redirects
```

Token needs **Account Filter Lists Edit** + **Bulk URL Redirects Edit**. Registry: `legacyRedirects` in `config/staging-access.json`.

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
| `scripts/setup-staging-redirects.mjs` | `setup:staging-redirects` | Bulk Redirects: legacy pages.dev → stg custom domains |
| `scripts/setup-dev-bindings.mjs` | `setup:dev-bindings` | Re-apply D1 bindings on `roy-expenses-stg` |
| `scripts/seed-dev.mjs` | `seed:dev` | Prod D1 export → dev (`.tmp/` gitignored) |
| `scripts/migrate-dev.mjs` | `migrate:dev` | Apply new migrations to dev (post-seed only) |
| `scripts/deploy-dev.sh` | `deploy:dev` | Deploy to `roy-expenses-stg` |

PRs on expense-tracker run `.github/workflows/deploy-dev.yml`.

## Gitignored local paths

| Path | Purpose |
| --- | --- |
| `samples/` | Personal bank statement samples |
| `reports/` | D1 exports and reconciliation CSVs |
| `.tmp/` | Prod→dev D1 dumps |
| `config/dev.json` | Dev D1 database id |
