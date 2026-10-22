# Deployment — expense-tracker

For an operator hosting the app on Cloudflare: Pages, D1, Access, migrations, backups and receipt storage.

## Hostname and DNS (one-time)

The app is one Cloudflare Pages project, named `expense-tracker` unless `EXPENSE_PROJECT_NAME` says otherwise
(`scripts/deploy.sh`). Add `<your-hostname>` as a custom domain on it and point your DNS at the project:

| Record name | Type | Target |
| --- | --- | --- |
| `<subdomain>` | CNAME | `<your-pages-project>.pages.dev` |

## Cloudflare Access

Add `<your-hostname>` to your Cloudflare Access application. The application names the scripts use are in
`config/staging-access.json`.

**Authentication only:** set the Allow policy to **Login methods → Google** (any Google account may sign in). The app
enforces who may use the tracker via D1 (`allowed_users`), not per-email Access rules. In the dashboard: Zero Trust →
Access → your application → Policies → Allow → replace email rules with a Google identity provider rule. Or, with a
token that has Zero Trust Access edit scope (the CI `CLOUDFLARE_API_TOKEN` usually works):

```bash
CLOUDFLARE_API_TOKEN=… npm run setup:access-google
```

**Sign out:** Settings shows a link to `/cdn-cgi/access/logout`, which clears the Cloudflare Access session cookie only
(the D1 allowlist is unchanged). `?redirect_url=<encoded-url>` sets where it lands.

**Staging** has its own Pages project, hostname and Access application. See [OPS.md](./OPS.md) for the setup scripts.

## App access control (D1 and the in-app admin)

The allowlist lives in D1 (`allowed_users`). New users request access in the app, and the owner approves from **Settings
→ Manage access** or `/access/admin`.

1. Run all migrations in order. Access control needs `0005_access_control.sql`, `0006_user_group_grants.sql` and
   `0007_oncall_group.sql`.
2. Copy `config/access.example.json` to `config/access.json` (owner email only).
3. Sync the Pages env: `npm run sync:access-env` (locally from `config/access.json`, in CI from the `OWNER_EMAIL`
   secret).
4. Bootstrap D1 from an existing list, once or when adding emails: `npm run bootstrap:allowed-users` (reads gitignored
   `config/allowed-emails.json`).

The `ALLOWED_EMAILS` Pages env is a bootstrap fallback when `allowed_users` is empty, and only if `ALLOW_BOOTSTRAP=1` is
also set. After bootstrap, D1 is authoritative and the fallback is ignored. The D1 binding is `DB`, bound to
`<your-d1-database>`.

**Owner admin (`/access/admin`):** approve or reject pending requests; toggle **group access** per user (the groups are
in `src/domain/accessGroups.ts`). New approvals get the `expenses` group only, and the expense API requires it
(`user_group_grants`). **Revoke all** removes the user and deletes their expense data, including `goal_scenarios`, and
their receipt files. Daily backups under `{email}/` in the backups bucket are not deleted on revoke (manual cleanup if
needed).

## CI

A push to `main` runs the **Deploy** workflow (`.github/workflows/deploy.yml`): `ci` (verify), then `schema`,
`migrate-dev` and `migrate-prod` (see Migrations), then the `ship` job. `ship` syncs the access env, deploys the
production and staging Pages projects, and redeploys the backup cron worker (`npm run deploy:backup-cron`) every time. A
pull request runs verify and deploys a staging preview only (`.github/workflows/deploy-dev.yml`, see
[OPS.md](./OPS.md)).

Secrets: `CLOUDFLARE_API_TOKEN` and `OWNER_EMAIL`. Token permissions (Cloudflare dashboard → My Profile → API Tokens):

| Scope | Permission | Used for |
| ----- | ---------- | -------- |
| Account → Cloudflare Pages | Edit | Pages deploy |
| Account → D1 | Edit | bootstrap and migrations |
| Account → Workers Scripts | Edit | `expense-backup-cron` deploy |
| Account → Workers R2 Storage | Edit | backup bucket bindings |

If Workers Scripts Edit is missing, the `ship` job fails at the backup cron worker until the token is updated. Run `npm
run deploy:backup-cron` locally with `wrangler login` to deploy it meanwhile.

## Migrations

**The deploy applies them.** `schema` reads both databases, read-only, and says what each needs. Dev is migrated
automatically. Production is migrated after you approve it in GitHub (the `production` environment), and only when it
has something pending. Each apply first takes a D1 Time Travel restore point. The code ships only after every migration
it needs has applied and the columns have been checked, and if a database's record cannot be trusted or a migration
fails, nothing ships. So a migration merges, applies, and then the code that needs it ships, in that order. Deploys
queue and are never cancelled, so a migration is not cut off partway, and a production migration left waiting for
approval holds the queue until you approve or reject it.

Because the running code keeps serving while a migration lands, a migration is additions only. A drop or rename ships in
a later release, once nothing reads what it removes.

By hand, `npm run migrate -- <database>` reports what a database lacks and writes nothing unless given `--apply`. It
exits 0 when the database is current, 1 when migrations are pending and 2 when it cannot trust what it sees (a hole in
the record, an unseeded database, or one it could not read). `npm run migrate:dev` applies what the dev database lacks.
Each file is recorded in `_migrations` by its name without `.sql`. Do not run a file with `wrangler d1 execute` on its
own: it applies the change without the record, and the next deploy tries to apply it again and fails with a duplicate
column.

**Check what a database has before trusting the record.** `_migrations` can be wrong when a file was applied by hand and
never recorded, or recorded without having run. The schema settles it. `npm run check:schema -- <db>` builds a database
from `migrations/`, reads the real one's columns over wrangler and lists what is missing with the migration that adds
it, and anything the database has that no migration makes. It only reads, exits 1 on a difference and 2 when the
database could not be read, and compares column names only, not types, defaults or indexes.

**A dev database that is ahead of `main`** (a column `main` does not make) fails the schema job on `EXTRA
<table>.<column>` and stops every deploy until that migration is merged. Apply a migration to dev by hand so that a
preview can save only when its merge is near, or remove the column again.

### If a migration goes wrong

| What happened | What to do | What it costs |
| ------------- | ---------- | ------------- |
| The migration job failed, so nothing shipped | Read the log: the restore point and `npm run check:schema -- <database>` say what state it is in. Fix the migration in a new PR, or finish it by hand. The queued deploy then ships. | Nothing is lost. The database may be partly changed until you do. |
| The migration applied and the new code is broken | Roll the code back: Cloudflare dashboard, Workers & Pages, `expense-tracker`, Deployments, pick the last good one, Rollback. The schema stays as it is. | Nothing is lost, provided the migration only added things. |
| The migration damaged or lost data | Run the **Restore database** workflow (Actions, Run workflow) with the database, the bookmark from the deploy run's summary, and the database name again to confirm. It waits for your approval. | **Every write since the bookmark is lost, user data included.** The workflow records the database's state just before, so running it again with that bookmark undoes the restore. |

The bookmark is on the summary page of the deploy run that applied the migration, under "Restore point", and in the log.
Cloudflare keeps 30 days of history on the paid plan and 7 on the free one. The daily backup in R2 is a coarser
fallback. After a restore, `npm run migrate -- <database>` lists the migrations it went back past as pending and the
next deploy applies them again, so fix the migration first. The restore command by hand is `npx wrangler d1 time-travel
restore <database> --bookmark=<bookmark>`.

### Writing a migration

`scripts/lint-migrations.mjs` runs in the test suite on every migration numbered above 31:

- **Name and number:** `NNNN_lower_snake_case.sql`, numbered upwards with none missing or repeated. Two PRs that each
  add the next number collide on whichever merges second.
- **Nothing the running code may still read goes away.** `DROP TABLE`, `DROP COLUMN` and `RENAME` need a `-- lint-allow:
  destructive <why it is safe>` comment above them. Ship the code that stops using a column first, then drop it in a
  later release.
- **Backfills are scoped.** An `UPDATE` or `DELETE` with no `WHERE` needs `-- lint-allow: unscoped <why every row is
  meant>`.
- **`IF NOT EXISTS`** on every `CREATE TABLE` and `CREATE INDEX`.
- `npm run verify` also checks that this page mentions the latest migration (`scripts/check-migration-docs.mjs`), so add
  a row to the table below.

### Migration tracking (read before re-running anything)

`0020_migrations_table.sql` adds `_migrations(name, applied_at)`, and `npm run migrate:dev` applies only files not
recorded there. This exists because **re-running a migration is destructive, not merely noisy.** `0003_multi_user.sql`
starts with `ALTER TABLE categories ADD COLUMN owner`, which fails with "duplicate column" on an already-migrated
database, and that failure is the only thing that stops it. Past it the file continues into three unscoped `UPDATE … SET
owner = 'owner@example.com'` statements and four `DROP TABLE` rebuilds, which against multi-owner data reassign every
row to the placeholder and drop four tables. `0012` ends with an `UPDATE goal_scenarios SET plan_start_date = …`, now
scoped with `WHERE plan_start_date IS NULL`. SQLite has no `ADD COLUMN IF NOT EXISTS`, so idempotent SQL cannot fix
this, and not running the file twice is the fix. **Never run `0003` or `0012` through `--command`.**

**Seeding a database that was fully migrated before `0020` existed.** This is deliberately not a migration, because a
brand-new database must execute `0001` to `0019`. Apply `0020` first, then once per such database:

```bash
npx wrangler d1 execute <db> --remote --command="INSERT OR IGNORE INTO _migrations (name) VALUES \
 ('0001_init'),('0002_cash_actuals'),('0003_multi_user'),('0004_default_account'),\
 ('0005_access_control'),('0006_user_group_grants'),('0007_oncall_group'),('0008_goal_scenarios'),\
 ('0009_installment_plans'),('0010_installment_due_day'),('0011_user_preferences'),\
 ('0012_wealth_checkins'),('0013_life_events'),('0014_custom_milestones'),\
 ('0015_transaction_flags'),('0016_transaction_attachments'),('0017_claimant_name'),\
 ('0018_reimbursement_links'),('0019_reimbursable_flags')"
```

It is safe to run twice. Until it is done, `migrate:dev` refuses, on either of two signals: a pending file numbered
below the highest recorded one (a database cannot have reached `0020` without them), or an empty record on a database
that already has a `transactions` table. Applying `0001` onward to a populated database would hand it `0003`'s four
`DROP TABLE`s.

**If `--file` fails with `fetch failed`, use `--command` for a pending file.** `wrangler d1 execute --file` can fail
with a repeatable `TypeError: fetch failed` on `POST /d1/database/<id>/import`, straight after "Uploading complete",
while `--command` queries against the same database succeed. Node 24 is the suspect, so try Node 22 first. Running the
statements one at a time through `--command` reaches the same end state: strip the `--` comments, split on `;`, run them
in order, then record the file in `_migrations`. Only do this for a pending file, since on an applied one it skips past
the error that would have stopped `--file`. The trade is atomicity: `--file` leaves the database untouched if the import
fails partway, and statement by statement can stop half-applied, so compare the result with `npm run check:schema`.

### Migrations that need more than the deploy

| Migration | What to know |
| --------- | ------------ |
| `0003`, `0012` | Never re-run (above). |
| `0011_user_preferences` | Its last `UPDATE` sets a day-13 budget rollover for the placeholder owner `owner@example.com`. Replace the placeholder with your Access email before applying, or delete the statement to keep calendar months. |
| `0016_transaction_attachments` | Uploads need the `RECEIPTS` R2 binding (`npm run setup:receipts`, below). Without it the upload route answers 503 and the rest of the app is unaffected. |
| `0020_migrations_table` | Seed any database migrated before it (above). |
| `0023_drop_goal_inputs` | Drops a table and a column; the data is gone. |
| `0035_owner_revision` | Creates `owner_revision`. SQL by hand that writes the dataset's tables must also delete the owner's row (below). |
| `0036_transaction_query_indexes`, `0037_pinned_rows_index` | Each index is built by reading every row once and adds a written row per insert (0037 only for investments and rows tied to a plan, flag or settlement). |
| `0038_description_norm` | See below. |

Every other migration needs nothing beyond the deploy. Each file's header comment says what it adds.

**Changing data by hand.** SQL by hand, a data migration or a seed script that writes the dataset's tables has to delete
that owner's revision, or a browser that cached the old data is told nothing changed: `DELETE FROM owner_revision WHERE
owner = '<email>'`. A Time Travel restore needs nothing, because the table goes back with the data it describes.

**Index cost on the Free plan.** Every index on `transactions` adds one written row per insert against the 100,000 a
day, so two new indexes make a 5,000-row import write 10,000 more rows. An inserted transaction costs its row and one
entry per index.

#### 0038: the stored normalized description

- **Order.** Apply it before the code that writes the column, because the INSERT and UPDATE statements name it. The
  deploy does this.
- **Afterwards.** Run `npm run check:schema -- <database>`, then check the index, which that command does not: `SELECT
  name FROM sqlite_master WHERE name = 'idx_txn_owner_desc_norm'`. Existing rows are NULL and the server fills them a
  few hundred at a time, the first time a route that needs the column is read. Until none wait, that route answers 503
  with `Retry-After`, and each retry gets further. No response carries the column and the dataset revision does not
  move.
- **Cost.** Building the index writes one row per existing transaction and the fill writes two, so a ledger of about
  33,000 transactions uses a day's write budget for both, and the fill resumes the next day if it runs out. An UPDATE
  that names `description` or `date` rewrites the index entry whether or not the value changed, and the edit form always
  sends both, so every edit writes one more row. Anything that inserts into `transactions` outside the API has to write
  the column (the seed generators in `scripts/` do), and a row left NULL is filled in later.
- **Half applied.** `ALTER TABLE ... ADD COLUMN` cannot be run twice. If the column is there and the index is not,
  finish by hand and record it: `CREATE INDEX IF NOT EXISTS idx_txn_owner_desc_norm ON transactions (owner,
  description_norm, date)`, then `INSERT OR IGNORE INTO _migrations (name) VALUES ('0038_description_norm')`.
- **Rolling back.** Rolling the code back in Pages is safe for the schema, since the column is nullable. But the
  previous code edits a description without the column, so a row edited while it was live keeps a value that is no
  longer its own, and only NULL rows are filled. The same happens on the dev database for every open PR preview without
  this code. After rolling forward, repair it and then drop the revisions so that a browser holding a cached series is
  told it changed:

```sql
-- every row (the default)
UPDATE transactions SET description_norm = NULL
-- or only the rows updated since the rollback began
UPDATE transactions SET description_norm = NULL WHERE updated_at >= '<when the rollback began, UTC>'
-- then, either way
DELETE FROM owner_revision
```

Use the first, which the next read refills at two written rows each, unless the ledger is too large to refill whole, and
then the second. A Time Travel restore to a point after the migration needs nothing. A restore to a point before it,
with this code live, makes every INSERT and every description UPDATE fail with "no column named description_norm", so
roll the code back first or run `npm run migrate -- <database> --apply` straight after.

## Receipt storage (R2)

Receipt photos and PDFs attached to a transaction. Bytes live in R2, and only metadata lives in D1.

1. Enable R2 on the account (already done if backups are running).
2. Run `npm run setup:receipts`. It creates the bucket `receipts` and binds `RECEIPTS` on production and preview.
3. Redeploy (`npm run deploy`) so the binding reaches the running Functions.

Objects are stored at `{owner-email}/{transaction-id}/{sha256}.{ext}`, plus `…_thumb.jpg` for raster images. Keys are
server-generated and contain no user-supplied string. Without the binding the app still works: the upload and serve
routes answer 503 and nothing else is affected, which is why the binding is optional in `functions/_shared/env.ts`.

**Cost.** R2's free tier is 10 GB-month of storage, 1M Class A and 10M Class B operations, with no egress charge.
`config/receipt-policy.json` caps one owner at 2 GB (about 20% of the tier, roughly 10,000 downscaled receipts)
alongside the backups bucket's 512 MB. An upload costs 2 Class A operations (file and thumbnail) and a view 1 to 2 Class
B, which `immutable` caching turns into 304s on repeat. The quota check is a single D1 aggregate, not an R2 list.
`RECEIPT_MAX_FILE_BYTES`, `RECEIPT_MAX_PER_TRANSACTION` and `RECEIPT_MAX_OWNER_BYTES` override the policy as Pages env
vars.

**Receipts are not in the daily backup.** The D1 snapshot carries attachment metadata, so a restore knows which receipts
existed, but the bytes are not copied: base64 in the JSON snapshot would add about 33% and trip the 5 MiB snapshot
alert, and copying R2 to R2 would multiply Class A operations without protecting against what the backup is for (D1
corruption or a bad migration). The real risk is an accidental bucket delete, which R2 object versioning addresses, so
enable it on the bucket if the receipts matter.

**Revoking a user** deletes their receipt bytes from R2 and then their rows from D1, via `purgeOwnerData`, in that
order, because the `transaction_attachments` rows are the only record of which objects are theirs. The R2 half is
best-effort: if it fails the revoke still completes and logs `revoke: receipt bytes for <email> were not deleted`. Sweep
the `{owner-email}/` prefix manually with `npx wrangler r2 object delete` only if you see that warning, or to catch
objects no row ever named (an upload whose row insert failed).

## Scheduled backups (R2)

A daily cron writes each owner's full dataset to R2 as JSON, at `{owner-email}/{YYYY-MM-DD}.json`. Pages has no cron
triggers, so it runs on a standalone Worker (`expense-backup-cron`, in `workers/backup-cron/`), which the `ship` job
redeploys on every merge to `main`.

1. Enable R2 on the account.
2. Run `npm run setup:backups`. It creates the backups bucket (its name is set in
   `scripts/setup-backup-infrastructure.mjs`) and binds `BACKUPS` on the Pages project, production and preview.
3. Deploy the worker with `npm run deploy:backup-cron`, or merge to `main`.

If `setup:backups` ran before R2 was enabled it may have bound `BACKUPS` to a missing bucket and blocked deploys. Remove
the binding with `node scripts/remove-backups-binding.mjs`, deploy, and re-run `npm run setup:backups` once R2 works. If
the Worker's `BACKUPS` binding is missing it logs a warning and skips, without failing the deploy.

**Policy.** `config/backup-policy.json` caps total backup storage at 512 MB (about 5% of the free tier) and keeps 14
days of snapshots, deleting the oldest first when over budget. The Pages env vars `BACKUP_RETENTION_DAYS`,
`BACKUP_MAX_BUCKET_BYTES` and `BACKUP_MAX_SNAPSHOT_BYTES` override it, and the Worker uses the same defaults unless you
add matching `[vars]` in `workers/backup-cron/wrangler.toml`. One invocation a day fits the Workers free tier (100,000
requests a day), and R2's free tier is ample.

**Verify.** Cloudflare dashboard → Workers & Pages → expense-backup-cron → Triggers shows the cron (`0 4 * * *` UTC).
After the first run, check the backups bucket. Locally: `npx wrangler dev --config workers/backup-cron/wrangler.toml
--test-scheduled`, then `curl "http://localhost:8787/cdn-cgi/handler/scheduled"`. To restore, download the JSON from R2
and re-import it with `wrangler d1 execute` or a one-off script.

**Alerts.** A large snapshot, or bucket usage above 80% of the cap (`bucketAlertThresholdFraction`), notifies through
the `BackupAlerts` port. Put recipients in gitignored `config/backup-alerts.json` (copy `backup-alerts.example.json`)
and run `npm run sync:backup-alerts`. It needs Cloudflare Email Sending on your domain and an `EMAIL` binding on the
Pages project, and the cron Worker logs alerts to Workers observability when `EMAIL` is not bound. The env vars are
`BACKUP_ALERT_TO`, `BACKUP_ALERT_FROM` and `BACKUP_ALERT_FROM_NAME`.
