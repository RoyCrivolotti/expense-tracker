# Measuring on a deployed D1

[SCALING.md](./SCALING.md) lists what is still an estimate: rows billed per route, Worker CPU, how `batch()` counts toward
the 50 queries per invocation, and whether a deployed D1 keeps table statistics. `scripts/measure-d1.mjs` measures the
first on the development database by running the real route handlers over the D1 REST API, which reports
`rows_read` and `rows_written` for every statement. It has been tested against the SQLite stand-in and not yet run
against Cloudflare.

## Rules

- **Never production.** `roy-expenses` is refused before any config or credential is read. The target must also match
  `config/dev.json`, end in `-dev`, differ from the production id in `workers/backup-cron/wrangler.toml`, and match what
  Cloudflare reports for that id. Anything that writes needs `--write` and `--confirm <database>`.
- **One synthetic owner.** Writes are made as `scaling-check@example.com` (reserved by RFC 2606, accepted by
  `scripts/check-pii.mjs`). Every write must bind it, DDL is refused, and ids start above what each table holds.
- **Small, because the budget is shared.** Cloudflare words the Free plan's 5M reads and 100k writes a day as the
  account's and never says per database, so they are treated as one budget with production: writing to dev spends it.
  Caps: 25,000 rows written in total (15,000 on a day) and 500,000 read; a run stops if the account has written 40,000
  or read 1.5M that day. An ordinary insert is 8 written rows (the row and 7 indexes); `budget.test.ts` pins that.
  `plan` prints the arithmetic. The recommended seeds are 303 and 910 transactions on separate days, 22,552 rows in all.
- **Removable by owner.** Cleanup deletes by that owner only; a test fails if a migration adds an owner table it does not know.

## What to provide

`CLOUDFLARE_API_TOKEN` (Account, D1, Edit; try the read-only token for read commands) and `CLOUDFLARE_ACCOUNT_ID` in the
environment, and `config/dev.json`. Optionally Account Analytics Read on the token, so the run can read the account's
use today; otherwise pass `--account-written-today N` from the D1 dashboard. `plan` and the dry runs need nothing.

## Commands

`npx tsx scripts/measure-d1.mjs <command>`, between 06:00 and 22:00 UTC and not while a migration is pending on dev.

1. `plan --transactions 300`, `seed`, `cleanup`: offline, print the budget and the statements.
2. `check --database roy-expenses-dev`: read-only. Reports the target, indexes, `sqlite_stat1`, `batch` through the API
   and today's account use. Note a Time Travel bookmark (`npx wrangler d1 time-travel info roy-expenses-dev`).
3. `snapshot --database roy-expenses-dev`: read-only, hashes every row that is not the synthetic owner's.
4. `seed --database D --write --confirm D --snapshot <file> --transactions 300`.
5. `measure --database D` (reads), then with `--write --confirm D` (adds the write routes).
6. `cleanup --database D --write --confirm D --transactions 300`, then `verify --database D --snapshot <file>`.
7. Repeat with 900 on a later day, `compare <run-a> <run-b>` for the growth per 1,000 transactions.

`.tmp/scaling/stop` ends a run before its next statement. Totals are kept in `.tmp/scaling/spend.json`.

## Verifying nothing else was touched

`verify` requires every owner table to hold no row for the synthetic owner and the fingerprint of everyone else's rows
to equal the snapshot's (hashes only, nothing printed). The staging site is live, so a difference in `owner_revision` or
`allowed_users.last_seen_at` is not proof of harm. Also compare the spend file's rows written with the dev database's in the
D1 dashboard; a large excess means something else wrote.

## The 50 queries per invocation

Counted in process, a bulk import is `6n + 4` D1 statements and a bulk edit `3n + 5`, plus 5 for the access checks. An
import of more than 6 rows or an edit of more than 13 therefore exceeds the documented Free limit of 50 whichever way
a batch counts, because neither is a batch. If either has worked on production, the limit does not bind there as documented.

To settle `batch()`: a throwaway draft PR adds a route that runs 60 `SELECT 1` in one `batch()` (`?mode=batch`) or as
60 separate calls (`?mode=separate`). Batch passes while separate fails at the 51st: a batch counts as one. Both fail: per
statement. Both pass: not enforced here. It writes no rows but needs a deploy.

## Still unmeasured

Worker CPU (the backup Worker's CPU metrics in the dashboard are free evidence at one size), anything above 910
transactions, D1 latency from a Worker, and the access-check statements, which the harness stubs.
