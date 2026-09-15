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

**Sign out:** Hub menu and Settings show a link to `/cdn-cgi/access/logout`, which clears the Cloudflare Access session cookie only (D1 allowlist unchanged). Optional redirect: `/cdn-cgi/access/logout?redirect_url=<encoded-url>`.

**Staging:** private staging uses the **roy-admin-staging** Access app and **https://stg-expenses.crivolotti.com** (`roy-expenses-stg`). See [docs/OPS.md](./OPS.md) for the full staging chain and setup scripts.

## App access control (D1 + in-app admin)

The allowlist lives in D1 (`allowed_users`). New users request access in the app; the owner approves from **Settings → Manage access** or `/access/admin`.

**Setup:**

1. Run all migrations in order (see [Migrations](#migrations) below for the current last one). Access control specifically needs `0005_access_control.sql`, `0006_user_group_grants.sql`, and `0007_oncall_group.sql`.
2. Copy `config/access.example.json` → `config/access.json` (owner email only).
3. Sync Pages env: `npm run sync:access-env` (local: `config/access.json`; CI: `OWNER_EMAIL` secret).
4. Bootstrap D1 from existing list (one-time / when adding emails): `npm run bootstrap:allowed-users`.

**GitHub secrets:** `OWNER_EMAIL`, `CLOUDFLARE_API_TOKEN`. (`ALLOWED_EMAILS` is optional for local `bootstrap:allowed-users` only — not read by CI deploy.)

**Local config (gitignored):** `config/allowed-emails.json`, `config/access.json`.

**Owner admin (`/access/admin`):** approve or reject pending requests; toggle **group access** per user (Expense Tracker, Financial documents, Legacy site, On-call pay); **Revoke all** removes the user and deletes expense data (including `goal_scenarios`). New approvals grant **Expense Tracker only** by default — enable finance/legacy/oncall manually. Settings shows a badge when requests are pending.

**Group access (hide-only MVP):** D1 table `user_group_grants` stores which resource groups each user may see. Hub cards and navigation filter client-side. Expense API requires the `expenses` group. Direct URLs to admin-hub HTML still work for anyone on Cloudflare Access (server enforcement deferred).

**R2 backups:** daily snapshots under `{email}/` in `roy-expenses-backups` are not deleted on revoke (manual cleanup if needed).

## D1 + legacy ALLOWED_EMAILS

D1 binding: `roy-expenses`. `ALLOWED_EMAILS` Pages env is a **bootstrap fallback** when `allowed_users` is empty, but only if `ALLOW_BOOTSTRAP=1` is also set. After bootstrap, D1 is authoritative and the env fallback is ignored.

```bash
npm run bootstrap:allowed-users
npm run sync:access-env
```

## CI

Push to `main` → verify → sync access env → deploy **production** (`expense-tracker`) and **staging** (`roy-expenses-stg`) → deploy backup cron worker.

Pull requests → verify + deploy **staging** only (`.github/workflows/deploy-dev.yml`). See [OPS.md](./OPS.md) for staging setup.

Secrets: `CLOUDFLARE_API_TOKEN`, `OWNER_EMAIL`.

**`CLOUDFLARE_API_TOKEN` permissions** (Cloudflare dashboard → My Profile → API Tokens → edit token):

| Scope | Permission | Used for |
| ----- | ---------- | -------- |
| Account → Cloudflare Pages | Edit | Pages deploy |
| Account → D1 | Edit | bootstrap / migrations (optional in CI) |
| Account → Workers Scripts | Edit | `expense-backup-cron` deploy |
| Account → Workers R2 Storage | Edit | backup bucket bindings |

If Workers Scripts Edit is missing, CI deploy of the backup cron worker fails until the token is updated. Deploy the worker locally once after updating the token, or run `npm run deploy:backup-cron` with `wrangler login`.

## Migrations

```bash
npx wrangler d1 execute roy-expenses --remote --file=migrations/NNNN_name.sql
```

Apply through `0020_migrations_table.sql` on production.

### Migration tracking (read before re-running anything)

`0020_migrations_table.sql` adds `_migrations(name, applied_at)`. `npm run migrate:dev` now applies
only files not recorded there, and records each one after it applies.

This exists because **re-running a migration was never merely noisy — it was destructive.**
`0003_multi_user.sql` starts with `ALTER TABLE categories ADD COLUMN owner`, which fails "duplicate
column" on an already-migrated database. That failure is the only thing that protected you. Past it
the file continues into three *unscoped* `UPDATE … SET owner = 'owner@example.com'` statements and
four `DROP TABLE` rebuilds — against today's multi-owner data that reassigns every row to the
placeholder and drops four tables. `0012` likewise ends with an unscoped
`UPDATE goal_scenarios SET plan_start_date = date(created_at)`, which overwrites a user-edited value.

Which makes the `--command` fallback below the dangerous path, not the safe one: it runs statements
individually, so it walks straight past the very error that was doing the protecting. **Never point
it at `0003` or `0012`.**

SQLite has no `ADD COLUMN IF NOT EXISTS`, so idempotent SQL cannot fix this on its own — 12 of the 20
files carry an `ADD COLUMN`. Not running the file at all is the fix.

Two things make that safer rather than replacing it:

- `IF NOT EXISTS` on every bare `CREATE TABLE`/`CREATE INDEX`, so a retry between "applied" and
  "recorded" is a no-op rather than an error.
- **Backfills are scoped to the rows they mean.** `0003` and `0012` said `UPDATE … SET owner = …`
  and `SET plan_start_date = …` with no `WHERE`, which is not just non-idempotent but wrong on its
  own terms: each means "the rows that do not have one yet". Both now carry
  `WHERE owner = ''` / `WHERE plan_start_date IS NULL` — identical on a first run, since the `ALTER`
  immediately above sets that state, and a no-op instead of a tenancy wipe on a re-run.

**Write new backfills scoped.** Table rebuilds (`DROP TABLE` + rename) cannot be made safe this way,
which is why the tracking table, not idempotency, carries the guarantee.

**One-time seeding, for the two databases that are already fully migrated.** Deliberately not a
migration — a brand-new database must genuinely execute `0001`–`0019`. Apply `0020` first, then, once
per existing database (`roy-expenses`, `roy-expenses-dev`):

```bash
npx wrangler d1 execute <db> --remote --command="INSERT OR IGNORE INTO _migrations (name) VALUES \
 ('0001_init'),('0002_cash_actuals'),('0003_multi_user'),('0004_default_account'),\
 ('0005_access_control'),('0006_user_group_grants'),('0007_oncall_group'),('0008_goal_scenarios'),\
 ('0009_installment_plans'),('0010_installment_due_day'),('0011_user_preferences'),\
 ('0012_wealth_checkins'),('0013_life_events'),('0014_custom_milestones'),\
 ('0015_transaction_flags'),('0016_transaction_attachments'),('0017_claimant_name'),\
 ('0018_reimbursement_links'),('0019_reimbursable_flags')"
```

`INSERT OR IGNORE` on a `PRIMARY KEY`, so running it twice is harmless. Until you do this,
`migrate:dev` sees an empty table, treats every file as pending, and warns loudly rather than
proceeding silently.

> **If `--file` fails with `fetch failed`, use `--command` instead.** Applying `0015`–`0019` to
> production hit a repeatable `TypeError: fetch failed` on `POST /d1/database/<id>/import`, ~13s in,
> straight after "Uploading complete". It was specific to the *import* path: `--command` queries
> against the same database in the same shell succeeded in under a millisecond, the same files
> imported cleanly into `roy-expenses-dev` minutes earlier, and upgrading to wrangler 4.131.1 changed
> nothing. For a file that has not been applied yet, running its statements individually through
> `--command` reaches the same end state — strip the `--` comments, split on `;`, and run them in
> order, then record it in `_migrations` yourself. That is how production took `0015`–`0019`.
>
> Only ever do this for a *pending* file. On an already-applied one it skips past the error that
> would have stopped a `--file` run — see the warning about `0003` and `0012` above.
>
> The trade is atomicity: `--file` leaves the database untouched if the import fails partway, whereas
> statement-by-statement can stop half-applied. Verify after, comparing the resolved schema (via
> `pragma_table_info`) against dev rather than trusting the statements were transcribed correctly. Personal goal scenarios: `npm run seed:scenarios` (reads gitignored seed config or `FINANCIAL_REVIEW_DIR`).

`0009_installment_plans.sql` adds the `installment_plans` table plus `plan_id` / `installment_index` columns on `transactions`. Apply it before (or with) the code deploy that reads those columns.

`0010_installment_due_day.sql` adds the nullable `due_day_of_month` column on `installment_plans` (existing rows stay `NULL`). Apply it before (or with) the code deploy that reads it for due-soon filtering on the Transactions cards.

`0011_user_preferences.sql` adds three nullable `settings` columns — `currency_code`, `number_locale`, `budget_rollover_day` — so the tracker is not tied to one owner's euros-and-13th conventions. `NULL` falls back to the built-in defaults (EUR, `de-DE` grouping, rollover day 1 = plain calendar months). The migration's final `UPDATE` keeps the primary owner on the historical day-13 rollover: replace the placeholder `owner@example.com` with the real Access email before applying to production. Users change all three later under Settings → Money & months (also set during onboarding).

`0012_wealth_checkins.sql` adds three new tables (`wealth_accounts`, `wealth_checkins`, `wealth_checkin_entries`) and a `plan_start_date` column on `goal_scenarios`. The new tables start empty (accounts are created through the Goals UI). The `plan_start_date` backfill is owner-agnostic — no placeholder substitution needed.

`0013_life_events.sql` adds a `life_events TEXT NOT NULL DEFAULT '[]'` column to `goal_scenarios`. Stores a JSON array of one-off cash events per scenario. Existing rows automatically get the empty-array default — no data migration needed.

`0014_custom_milestones.sql` adds a nullable `milestones TEXT` column to `settings`. Stores a JSON array of `{label, amountCents}` net-worth milestones per owner. `NULL` falls back to the built-in €100k–€1M defaults, so existing owners see no change until they edit the list from the Goals tab's Progress view; an empty array is a deliberate "no milestones" choice. Owner-agnostic — no placeholder substitution needed. Apply it before (or with) the code deploy that reads the column.

`0015_transaction_flags.sql` adds the `flags` table plus a nullable `flag_id` column on `transactions`. Flags are reusable named markers (name + colour + optional description) for tracking work that outlives a budget month — the motivating case is "expenses I still have to claim back from an employer". The table starts empty; no defaults are seeded, and flags are created through Settings → Flags or the picker in the transaction editor. `flag_id` stays `NULL` on every existing row, so there is no backfill and no placeholder substitution. Deleting a flag clears `flag_id` on its transactions rather than reassigning them (the column is nullable, unlike `category_id`). Apply it before (or with) the code deploy that reads the column.

`0016_transaction_attachments.sql` adds the `transaction_attachments` table — metadata only, for receipt photos and PDFs whose bytes live in R2. It starts empty and nothing reads it until an attachment is uploaded, so it is safe to apply ahead of the code deploy. It needs the `RECEIPTS` R2 binding to be useful: run `npm run setup:receipts` first (see **Receipt storage (R2)** below). Without the binding the upload route returns a clean 503 and the rest of the app is unaffected. Owner-agnostic — no placeholder substitution needed.

`0017_claimant_name.sql` adds a nullable `claimant_name` column on `settings` — the name printed at the top of an expense report, so the document identifies who is submitting it. `NULL` reads as `''` and the report simply omits the name line, so existing owners see no change until they fill it in under Settings → Expense reports. Deliberately not derived from the Cloudflare Access email: that identifies the account, not the person, and an address on an expense form reads as a mistake. Owner-agnostic — no placeholder substitution needed.

`0018_reimbursement_links.sql` adds a nullable `settled_by` column on `transactions`, holding the id of the `refund` transaction that reimbursed that row, plus a partial index. It is set when a reimbursement is recorded and cleared if that reimbursement is deleted, so the link is reversible. Deliberately *not* a clearing of `flag_id`: unflagging on settlement would empty the Flagged card just as well, but it throws away which transactions were in which claim — the thing this column exists to record — and cannot be undone, since nothing would remember the flag. `groupTransactionsByFlag` skips settled rows instead, so the card empties and the history survives. Every existing row stays `NULL`, so there is no backfill and no placeholder substitution.

`0019_reimbursable_flags.sql` adds a `reimbursable INTEGER NOT NULL DEFAULT 1` column on `flags`. Flags are generic markers: "Work travel" is money an employer will repay, "Tax deductible" is a note for an accountant that nobody is going to pay. Only a reimbursable flag offers an expense report and a Record reimbursement action — on the others they produce a document headed EXPENSE REPORT with a signature line, addressed to nobody. It defaults to `1` rather than `0` on purpose: the flags that already exist were created when flagging *was* reimbursement, so every one of them is reimbursable, and defaulting to `0` would silently take the buttons away from a feature already in use. Owner-agnostic — no placeholder substitution needed.

## Old URL

`https://roy-admin.crivolotti.com/expenses` redirects here (301 in admin-hub `_redirects`).

## Public repo?

Repository visibility and git history hygiene checklist is kept locally (not in this repo).

## Receipt storage (R2)

Receipt photos and PDFs attached to a transaction. Bytes live in R2; only metadata lives in D1.

**Cost:** R2's free tier is 10 GB-month storage, 1M Class A ops and 10M Class B, with no egress charge. `config/receipt-policy.json` caps one owner at **2 GB** (~20% of the tier, roughly 10,000 downscaled receipts) alongside the backups bucket's 512 MB. An upload costs 2 Class A ops (file + thumbnail) and a view 1–2 Class B, which `immutable` caching turns into 304s on repeat. The quota check is a single D1 aggregate, not an R2 list, so it burns no Class A ops.

1. Enable R2 on the account (dashboard) — already done if backups are running.
2. Run `npm run setup:receipts` — creates bucket `receipts` and binds `RECEIPTS` on production **and** preview.
3. Redeploy (`npm run deploy`) so the binding reaches the running Functions.

Objects are stored at `{owner-email}/{transaction-id}/{sha256}.{ext}`, plus `…_thumb.jpg` for raster images. Keys are server-generated and contain no user-supplied string.

**Without the binding the app still works**: the upload and serve routes return a clean 503 and nothing else is affected. That is the same degradation `BACKUPS` uses, and it is why the binding is optional in `functions/_shared/env.ts`.

Optional Pages env vars override the policy JSON: `RECEIPT_MAX_FILE_BYTES`, `RECEIPT_MAX_PER_TRANSACTION`, `RECEIPT_MAX_OWNER_BYTES`.

> **Receipts are not covered by the daily backup.** The D1 snapshot carries attachment *metadata*, so a restore knows which receipts existed — but the bytes are not copied. Base64 in the JSON snapshot would add ~33% and immediately trip the 5 MiB snapshot alert, and R2→R2 copying would multiply Class A ops for no protection against the risk the backup exists for (D1 corruption or a bad migration). The real receipt-loss risk is an accidental bucket delete, which R2 object versioning addresses properly. Enable it on the bucket if the receipts matter.

**Revoking a user** deletes their receipt bytes from R2 *and* their rows from D1, via `purgeOwnerData` — in that order, because the `transaction_attachments` rows are the only record of which objects are theirs, and the D1 batch deletes those rows. The R2 half is best-effort: if it fails the revoke still completes (leaving the rows and their access in place would be worse) and logs `revoke: receipt bytes for <email> were not deleted`.

Sweep manually with `npx wrangler r2 object delete` against the `{owner-email}/` prefix only if you see that warning, or to catch objects no row ever named (an upload whose row insert failed).

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

Requires Cloudflare **Email Sending** enabled on your domain and an `EMAIL` binding on this Pages project. The cron Worker logs alerts to Workers observability when `EMAIL` is not bound. Env vars: `BACKUP_ALERT_TO`, `BACKUP_ALERT_FROM`, `BACKUP_ALERT_FROM_NAME`.

**Ports & adapters** (for swapping vendors): persistence → `ExpenseRepository`; object storage → `BackupStore`; auth → `AuthProvider`; email → `EmailSender`. Interfaces live in `src/domain/ports/`.

Functions import domain code via `functions/domain` → `../src/domain` (symlink). Cloudflare’s Pages Functions bundler does not honour Wrangler `alias` config, so `@domain/...` cannot be used in `functions/` — the Vite app still uses `@domain/*` / `@config/*` path aliases.

One-time setup (R2 bucket + Pages binding) — uses wrangler OAuth when logged in locally:

```bash
npm run setup:backups
npm run deploy:backup-cron
```
