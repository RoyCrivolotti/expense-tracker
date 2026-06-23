# Ops scripts — expense-tracker

One-time and maintenance scripts not wired into daily dev.

| Script | npm alias | Purpose |
| --- | --- | --- |
| `scripts/gen-seed-sql.ts` | — | Generate D1 seed SQL from finance-review workbook (`FINANCIAL_REVIEW_DIR`, `EXPENSE_OWNER`) |
| `scripts/remove-backups-binding.mjs` | — | Remove R2 BACKUPS binding from production when R2 is not enabled |
| `scripts/setup-dev-bindings.mjs` | `setup:dev-bindings` | Bind Pages **preview** to `roy-expenses-dev` D1 |
| `scripts/setup-access-preview.mjs` | `setup:access-preview` | Add dev preview hostname to roy-admin Access |
| `scripts/migrate-dev.mjs` | `migrate:dev` | Apply all migrations to `roy-expenses-dev` |
| `scripts/seed-dev.mjs` | `seed:dev` | Export prod D1 → import into dev (dump in gitignored `.tmp/`) |
| `scripts/deploy-dev.sh` | `deploy:dev` | Deploy branch `dev` preview (not production) |

## Dev environment (staging)

1. `wrangler d1 create roy-expenses-dev` — copy id to `config/dev.json` (from `config/dev.example.json`)
2. `npm run setup:dev-bindings`
3. `npm run migrate:dev`
4. `npm run seed:dev` (copies prod data; dump stays in `.tmp/`, never commit)
5. `npm run setup:access-preview` (adds `dev.expense-tracker-3hq.pages.dev` to Access)
6. PRs run `.github/workflows/deploy-dev.yml` → verify + preview deploy

Preview uses **roy-expenses-dev** D1 (isolated from prod). Production bindings are unchanged.

## Gitignored local paths

| Path | Purpose |
| --- | --- |
| `samples/` | Personal bank statement samples (never commit) |
| `reports/` | D1 exports and reconciliation CSVs |
| `.tmp/` | Prod→dev D1 dumps |
| `config/dev.json` | Dev D1 database id |
