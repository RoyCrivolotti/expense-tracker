# Deployment — expense-tracker

## URL

| Surface | URL | Cloudflare Pages project |
| --- | --- | --- |
| Expense tracker | **https://expenses.crivolotti.com** | `expense-tracker` |

## DreamHost DNS (one-time)

| Record name | Type | Target |
| --- | --- | --- |
| `expenses` | CNAME | `expense-tracker-3hq.pages.dev` |

Add **expenses.crivolotti.com** as a custom domain on the expense-tracker Pages project.

## Cloudflare Access

Add **expenses.crivolotti.com** to the **roy-admin** Access application (same Google allowlist as admin-hub).

## D1 + ALLOWED_EMAILS

D1 binding lives on the **expense-tracker** Pages project. Database name: `roy-expenses`.

**Local:** copy `config/allowed-emails.example.json` → `config/allowed-emails.json` (gitignored).

**CI:** set GitHub secret `ALLOWED_EMAILS` (JSON array or comma-separated emails).

```bash
npm run sync:allowed-users
```

## CI

Push to `main` → verify → `sync:allowed-users` → deploy.

Secrets: `CLOUDFLARE_API_TOKEN`, `ALLOWED_EMAILS`.

## Migrations

```bash
npx wrangler d1 execute roy-expenses --remote --file=migrations/NNNN_name.sql
```

## Old URL

`https://roy-admin.crivolotti.com/expenses` redirects here (301 in admin-hub `_redirects`).

## Public repo?

See [PUBLIC_READINESS.md](./PUBLIC_READINESS.md) before changing repository visibility.

## Scheduled backups (R2)

> **Deferred (2026-06):** R2 enablement blocked on Cloudflare's side. Code and `BACKUPS` binding are ready; finish when R2 is available (not urgent — D1 is the source of truth and CSV export covers manual backup for now). Checklist: enable R2 → `npm run setup:backups` → cron `0 4 * * *` → deploy.

Daily cron exports each owner's full dataset to R2 as JSON. R2's free tier (10 GB-month storage, 1M Class A ops) is ample for this app; policy defaults in [`config/backup-policy.json`](../config/backup-policy.json) cap total backup storage at **512 MB** (~5% of free tier) and retain **14 days** of daily snapshots. Oldest files are deleted first when over budget. Optional Pages env vars override the JSON: `BACKUP_RETENTION_DAYS`, `BACKUP_MAX_BUCKET_BYTES`, `BACKUP_MAX_SNAPSHOT_BYTES`.

1. Enable R2 on the account (dashboard — $0 while under free tier).
2. Create bucket `roy-expenses-backups` (private) — or run setup below.
3. On the **expense-tracker** Pages project, add binding `BACKUPS` → that bucket.
4. Add cron trigger: `0 4 * * *` (04:00 UTC daily) targeting `functions/scheduled.ts`.
5. Backups are stored at `{owner-email}/{YYYY-MM-DD}.json`.

Restore: download JSON from R2 and re-import via `wrangler d1 execute` or a one-off script.

If `BACKUPS` is not bound, the scheduled handler logs a warning and skips (no deploy failure).

**Backup alerts (email + logs):** large snapshots and bucket usage above **80%** of the cap (`bucketAlertThresholdFraction` in `config/backup-policy.json`) notify via the `BackupAlerts` port. Configure recipients in gitignored `config/backup-alerts.json` (copy from `backup-alerts.example.json`), then:

```bash
npm run sync:backup-alerts
```

Requires Cloudflare **Email Sending** enabled on your domain and an `EMAIL` binding on this Pages project. No addresses are hardcoded in source — only env vars `BACKUP_ALERT_TO`, `BACKUP_ALERT_FROM`, `BACKUP_ALERT_FROM_NAME`.

**Ports & adapters** (for swapping vendors): persistence → `ExpenseRepository`; object storage → `BackupStore`; auth → `AuthProvider`; email → `EmailSender`. Interfaces live in `src/domain/ports/` and are imported as `@domain/...` in Functions code.

Automated setup (R2 bucket + binding) — uses wrangler OAuth when logged in locally:

```bash
npm run setup:backups
```

Then add the cron trigger in the dashboard (no public API yet): **Workers & Pages → expense-tracker → Settings → Functions → Cron triggers → `0 4 * * *`**.
