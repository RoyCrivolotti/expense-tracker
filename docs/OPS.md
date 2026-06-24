# Dev staging — expense-tracker

Full chain: **roy-dev** (landing) → **roy-private** (admin hub) → **dev expense tracker** + **dev on-call tracker**.

| URL | Pages project | Role |
| --- | --- | --- |
| https://roy-dev.pages.dev | `roy-dev` | Public landing (staging banner) |
| https://roy-private.pages.dev | `roy-private` | Admin hub + reports (Access) |
| https://dev.expense-tracker-3hq.pages.dev | `expense-tracker` branch `dev` | Expense SPA + API (Access) |
| https://dev.oncall-tracker-20h.pages.dev | `oncall-tracker` branch `dev` | On-call SPA + API (Access) |

All private surfaces share the **roy-admin** Cloudflare Access app (Google login). Without the staging hostnames on that app, APIs return `401 Not authenticated`.

## One-time setup

### expense-tracker

1. `wrangler d1 create roy-expenses-dev` → copy id to `config/dev.json`
2. `npm run setup:dev-bindings`
3. `npm run seed:dev` (empty DB; **do not** run `migrate:dev` first)
4. `npm run setup:access-preview` (or add hostnames in Access dashboard — see below)

### admin-hub

1. `npm run setup:staging-bindings` (D1 → roy-expenses-dev, OWNER_EMAIL)
2. `npm run deploy:staging` → `roy-private` Pages project

### landing

1. `npm run deploy:staging` → `roy-dev` Pages project (uses committed `.env.staging`)

### oncall-tracker

1. `wrangler d1 create roy-oncall-dev` → copy id + roy-expenses-dev access id into `config/dev.json`
2. `npm run setup:dev-bindings`
3. `npm run deploy:dev` → `oncall-tracker` branch `dev`

## CSV import format

Transaction import expects the same header as export (see `src/domain/data/exportCsvFormat.ts`):

`id,date,budget_month,description,category,account,type,amount_cents,status,cancelled,notes`

- **category** / **account**: must match existing names exactly.
- **type**: `expense`, `income`, `investment`, or `refund`.
- **amount_cents**: integer cents, always positive.
- **date** / **budget_month**: ISO `YYYY-MM-DD` and `YYYY-MM`.
- Easiest path: Settings → Export, edit the CSV, then Import.

Settings → Import includes a **Download template** with the header and one example row.

## Access hostnames (required)

Add to **roy-admin** Access application:

- `dev.expense-tracker-3hq.pages.dev`
- `dev.oncall-tracker-20h.pages.dev`
- `roy-private.pages.dev`

`npm run setup:access-preview` needs `CLOUDFLARE_API_TOKEN` with **Zero Trust → Access → Edit**. Wrangler OAuth alone cannot do this.

## Scripts (expense-tracker)

| Script | npm alias | Purpose |
| --- | --- | --- |
| `scripts/setup-dev-bindings.mjs` | `setup:dev-bindings` | Preview → `roy-expenses-dev` D1 |
| `scripts/setup-access-preview.mjs` | `setup:access-preview` | Staging hostnames on Access app |
| `scripts/seed-dev.mjs` | `seed:dev` | Prod D1 export → dev (`.tmp/` gitignored) |
| `scripts/migrate-dev.mjs` | `migrate:dev` | Apply new migrations to dev (post-seed only) |
| `scripts/deploy-dev.sh` | `deploy:dev` | Deploy expense-tracker branch `dev` |

PRs on expense-tracker run `.github/workflows/deploy-dev.yml`.

## Gitignored local paths

| Path | Purpose |
| --- | --- |
| `samples/` | Personal bank statement samples |
| `reports/` | D1 exports and reconciliation CSVs |
| `.tmp/` | Prod→dev D1 dumps |
| `config/dev.json` | Dev D1 database id |
