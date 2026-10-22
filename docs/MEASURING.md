# Measuring on a deployed D1

For an operator who wants the rows billed per route on a real D1 database. [SCALING.md](./SCALING.md) says what is
still an estimate. `scripts/measure-d1.mjs` runs the real route handlers against the dev database over the D1 REST API,
which reports `rows_read` and `rows_written` for every statement. It cannot measure Worker CPU.

## Rules

- **Never production.** The production database name is refused before any config or credential is read. The target must
  also match `config/dev.json`, end in `-dev`, differ from the production id bound in `workers/backup-cron/wrangler.toml`,
  and match what Cloudflare reports for that id. Anything that writes needs `--write` and `--confirm <database>`.
- **One synthetic owner.** Writes are made as `scaling-check@example.com` (reserved by RFC 2606, accepted by
  `scripts/check-pii.mjs`). Every write must bind it, DDL is refused, and ids start above what each table holds.
- **Small, because the budget is shared.** Cloudflare states the Free plan's daily D1 limits for the account and never per
  database, so they are treated as one budget with production: writing to dev spends it. A run stops at 25,000 rows
  written (15,000 on one day) and 500,000 read in total, and refuses to start if the account has already written 40,000 or
  read 1.5M rows that day. An ordinary insert is 8 written rows (the row and 7 indexes). `plan` prints the arithmetic.
- **Removable by owner.** Cleanup deletes by that owner only, one table at a time.

## What to provide

`CLOUDFLARE_API_TOKEN` (Account, D1, Edit; try a read-only token for the read commands) and `CLOUDFLARE_ACCOUNT_ID` in
the environment, and `config/dev.json`. Optionally Account Analytics Read on the token, so a run can read the account's
use today; otherwise pass `--account-written-today N` from the D1 dashboard. `plan` and the dry runs need nothing.

## Commands

`npx tsx scripts/measure-d1.mjs <command>`, with `D` standing for `<your-dev-d1-database>`.

1. `plan --transactions 300`, `seed`, `cleanup`: offline; print the budget and the statements.
2. `check --database D`: read-only. Reports the target, indexes, `sqlite_stat1`, `batch` through the API and today's use.
   Note a Time Travel bookmark first: `npx wrangler d1 time-travel info D`.
3. `snapshot --database D`: read-only; hashes every row that is not the synthetic owner's.
4. `seed --database D --write --confirm D --snapshot <file> --transactions 300`.
5. `measure --database D` (reads), then again with `--write --confirm D` (adds the write routes).
6. `cleanup --database D --write --confirm D --transactions 300`, then `verify --database D --snapshot <file>`.
7. Repeat with a larger seed on another day, then `compare <run-a> <run-b>` for the growth per 1,000 transactions.

`.tmp/scaling/stop` ends a run before its next statement. Totals are kept in `.tmp/scaling/spend.json`.

## Verifying nothing else was touched

`verify` requires every owner table to hold no row for the synthetic owner, and the fingerprint of everyone else's rows to
equal the snapshot's (hashes only; nothing is printed). Staging is live, so a difference in `owner_revision` or
`allowed_users.last_seen_at` is not proof of harm. Also compare the spend file's rows written with the dev database's
in the D1 dashboard: a large excess means something else wrote.

## The 50 queries per invocation

The statements each bulk route issues are counted in [API.md](./API.md#bulk-transaction-routes), and Cloudflare
documents a limit of 50 queries per invocation on the Free plan. **If the plan enforces that limit for these routes as
documented**, a create of more than 6 rows or an edit by id of more than 13 would exceed it whichever way a batch
counts, because the rows are inserted, or read back, one at a time, and the 500-id cap would not be usable on the Free
plan. Nobody has seen the limit enforced for these routes on a deployed Worker. The counts are measured on the SQLite
stand-in, and the thresholds also rest on the access checks, an estimate of about five statements. The throwaway route
below would settle both.

To settle how `batch()` counts, a throwaway draft PR adds a route that runs 60 `SELECT 1` in one `batch()`
(`?mode=batch`) or as 60 separate calls (`?mode=separate`). Batch passes while separate fails at the 51st: a batch counts
as one. Both fail: it counts per statement. Both pass: the limit is not enforced. It writes no rows but needs a deploy.

## Not measured

Worker CPU, anything above the seeded size, D1 latency from a Worker, and the access-check statements, which the
harness stubs.
