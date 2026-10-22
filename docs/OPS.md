# Staging — expense-tracker

For an operator setting up and using staging. Staging is a second Pages project (`<your-staging-project>`) with its own
D1 database (`<your-dev-d1-database>`), hostname and Cloudflare Access application, so a change can be tried on
Cloudflare without touching production. The setup scripts read the names and hostnames from
`config/staging-access.json`, which is tracked and holds the maintainer's values, so replace them first
([DEPLOYMENT.md](./DEPLOYMENT.md#adapting-a-fork)), and from `config/dev.json`, your gitignored copy of
`config/dev.example.json`.

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

```

Token needs **Zero Trust → Access → Edit**. Wrangler OAuth alone cannot do this. If the production application still
lists staging or `*.pages.dev` hostnames from an earlier setup, `npm run setup:access-migrate` removes them.

### 4. Deploy a staging build

```bash
npm run deploy:dev
```

Sign in once at any hostname of the staging Access application; the cookie applies to the others.

## Migrations on staging

A pull request's preview deploy applies no migration and uses the dev database, so a preview of a change that adds a
column fails to save until dev has it (`npm run migrate:dev`). Reading is safe, because a missing column reads as its
default. How the deploy applies migrations, and why a dev database ahead of `main` stops deploys, is in
[DEPLOYMENT.md](./DEPLOYMENT.md#migrations).

## Scripts

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
| `scripts/measure-d1.mjs` | `measure:d1` | Measure rows billed per route on the dev D1 as a synthetic owner; see [MEASURING.md](./MEASURING.md) |
| `scripts/deploy-dev.sh` | `deploy:dev` | Deploy to the staging project |

PRs on expense-tracker run `.github/workflows/deploy-dev.yml`.

## Staging demo account

A shared Google account for reviewers, set with `DEMO_EMAIL` (the default is in `scripts/seed-demo-staging.mjs`). Data
lives in `fixtures/demo-staging-expenses.csv` (Jan–Jun ledger) and `fixtures/demo-staging-goal-scenarios.json` (four
saved scenarios).

**One-time / reset:**

```bash
unset CLOUDFLARE_API_TOKEN
npm run seed:demo-staging
```

This allowlists the demo email on the dev database, grants the `expenses` group, and loads synthetic data for that owner
only. Other staging users are untouched.

**Share with visitors:** link to your staging hostname and the demo Google credentials (keep them in a password manager;
never commit passwords).

To use a different demo email: `DEMO_EMAIL=you@example.com npm run seed:demo-staging`.

## Reading the ledger in parts (browser switch)

By default the app loads the whole ledger with one `GET /api/expenses`. A browser can instead read it in parts
([API.md](./API.md)) and build every screen from them. The switch is kept in that browser, so it needs no deploy.

- `?ledger=on` in the address turns it on for this browser (kept in local storage as `expenses-ledger-mode`) and
  `?ledger=off` turns it off.
- `?ledger=shadow` does the same and also loads the whole dataset after the ledger settles and compares the two. It
  counts as `off` anywhere but a development or `--mode staging` build. Differences go to the console as
  `[ledger shadow]` and to `window.__ledgerShadow` (`checks` and `differences`); an empty `differences` after a few
  edits means the parts agree with the dataset.
- When it falls back to the old load, and what it holds, are in [ARCHITECTURE.md](./ARCHITECTURE.md#in-the-browser).
- `npm run verify:ledger-mode` compares the demo instance's screens under `?ledger=off` and `?ledger=on`
  ([TESTING.md](./TESTING.md#real-browser-checks-manual)).

## Gitignored local paths

| Path | Purpose |
| --- | --- |
| `samples/` | Personal bank statement samples |
| `reports/` | D1 exports and reconciliation CSVs |
| `.tmp/` | Prod→dev D1 dumps |
| `config/dev.json` | Dev D1 database id |
