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

Add **expenses.crivolotti.com** to the **roy-admin** Access application.

**Authentication only:** set the Allow policy to **Login methods → Google** (any Google account may sign in). The app enforces who may use the tracker via D1 (`allowed_users`), not per-email Access rules.

One-time dashboard change: Workers & Pages → Access → roy-admin → Policies → Allow → replace email rules with a Google identity provider rule.

Or, with a token that has Zero Trust Access edit scope (the CI `CLOUDFLARE_API_TOKEN` usually works):

```bash
CLOUDFLARE_API_TOKEN=… npm run setup:access-google
```

## App access control (D1 + email)

The allowlist lives in D1 (`allowed_users`). New users request access in the app; the owner approves via a signed email link.

**Setup:**

1. Run migration `migrations/0005_access_control.sql`.
2. Copy `config/access.example.json` → `config/access.json` (owner email, app URL, sender).
3. Generate approve secret: `openssl rand -base64 32` → GitHub secret `ACCESS_APPROVE_SECRET`.
4. Sync Pages env: `npm run sync:access-env` (local: needs `config/access.json`; CI: `OWNER_EMAIL` + `ACCESS_APPROVE_SECRET` secrets).
5. Bootstrap D1 from existing list (one-time / when adding emails): `npm run bootstrap:allowed-users` (uses `config/allowed-emails.json` or `ALLOWED_EMAILS`). Not run in CI — the deploy token lacks D1 execute; use wrangler OAuth locally or grant D1 Edit on the token.

**GitHub secrets:** `ACCESS_APPROVE_SECRET`, `OWNER_EMAIL`, `ALLOWED_EMAILS` (bootstrap), `CLOUDFLARE_API_TOKEN`.

**Local config (gitignored):** `config/allowed-emails.json`, `config/access.json`.

Requires Cloudflare **Email Sending** + `EMAIL` binding on Pages (same as backup alerts). Reuses `BACKUP_ALERT_FROM` when `ACCESS_EMAIL_FROM` is unset.

**Phase 2 (later):** in-app user admin — revoke access, purge data, view `last_seen_at`.

## D1 + legacy ALLOWED_EMAILS

D1 binding: `roy-expenses`. `ALLOWED_EMAILS` Pages env is a **bootstrap fallback** when `allowed_users` is empty; after bootstrap, D1 is authoritative.

```bash
npm run bootstrap:allowed-users
npm run sync:access-env
```

## CI

Push to `main` → verify → sync access env → bootstrap D1 → deploy (+ backup cron worker).

Secrets: `CLOUDFLARE_API_TOKEN`, `ALLOWED_EMAILS`, `OWNER_EMAIL`, `ACCESS_APPROVE_SECRET`.

## Migrations

```bash
npx wrangler d1 execute roy-expenses --remote --file=migrations/NNNN_name.sql
```

## Old URL

`https://roy-admin.crivolotti.com/expenses` redirects here (301 in admin-hub `_redirects`).

## Public repo?

See [PUBLIC_READINESS.md](./PUBLIC_READINESS.md) before changing repository visibility.

## Scheduled backups (R2)

Daily cron exports each owner's full dataset to R2 as JSON. **Pages does not support cron triggers**, so scheduling runs on a standalone Worker (`expense-backup-cron` in `workers/backup-cron/`).

**Cost:** one cron invocation per day fits Cloudflare Workers free tier (100k requests/day). R2 free tier (10 GB-month storage, 1M Class A ops) is ample; policy defaults in [`config/backup-policy.json`](../config/backup-policy.json) cap total backup storage at **512 MB** (~5% of free tier) and retain **14 days** of daily snapshots. Oldest files are deleted first when over budget.

1. Enable R2 on the account (dashboard).
2. Run `npm run setup:backups` — creates bucket `roy-expenses-backups` and binds `BACKUPS` on the expense-tracker Pages project (production + preview).
3. Deploy the cron worker: `npm run deploy:backup-cron` (also runs automatically on push to `main` via CI).
4. Backups are stored at `{owner-email}/{YYYY-MM-DD}.json`.

Optional Pages env vars override policy JSON: `BACKUP_RETENTION_DAYS`, `BACKUP_MAX_BUCKET_BYTES`, `BACKUP_MAX_SNAPSHOT_BYTES`. The Worker uses the same defaults from `config/backup-policy.json` unless you add matching `[vars]` in `workers/backup-cron/wrangler.toml`.

If `setup:backups` was run before R2 was enabled, it may have bound `BACKUPS` to a missing bucket and **blocked deploy**. Remove the binding with `node scripts/remove-backups-binding.mjs`, then deploy; re-run `npm run setup:backups` once R2 works.

Restore: download JSON from R2 and re-import via `wrangler d1 execute` or a one-off script.

If the Worker's `BACKUPS` binding is missing, the handler logs a warning and skips (no deploy failure).

**Verify:** Cloudflare dashboard → Workers & Pages → expense-backup-cron → Triggers (cron `0 4 * * *` UTC). After the first run, check R2 bucket `roy-expenses-backups`. To test locally: `npx wrangler dev --config workers/backup-cron/wrangler.toml --test-scheduled` then `curl "http://localhost:8787/cdn-cgi/handler/scheduled"`.

**Backup alerts (email + logs):** large snapshots and bucket usage above **80%** of the cap (`bucketAlertThresholdFraction` in `config/backup-policy.json`) notify via the `BackupAlerts` port. Configure recipients in gitignored `config/backup-alerts.json` (copy from `backup-alerts.example.json`), then:

```bash
npm run sync:backup-alerts
```

Requires Cloudflare **Email Sending** enabled on your domain and an `EMAIL` binding on this Pages project. The cron Worker logs alerts to Workers observability when `EMAIL` is not bound. No addresses are hardcoded in source — only env vars `BACKUP_ALERT_TO`, `BACKUP_ALERT_FROM`, `BACKUP_ALERT_FROM_NAME`.

**Ports & adapters** (for swapping vendors): persistence → `ExpenseRepository`; object storage → `BackupStore`; auth → `AuthProvider`; email → `EmailSender`. Interfaces live in `src/domain/ports/`.

Functions import domain code via `functions/domain` → `../src/domain` (symlink). Cloudflare’s Pages Functions bundler does not honour Wrangler `alias` config, so `@domain/...` cannot be used in `functions/` — the Vite app still uses `@domain/*` / `@config/*` path aliases.

One-time setup (R2 bucket + Pages binding) — uses wrangler OAuth when logged in locally:

```bash
npm run setup:backups
npm run deploy:backup-cron
```
