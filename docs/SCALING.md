# Scaling

How the app behaves as the number of transactions grows, what that costs today, and the direction the data
layer is moving in. Every number below can be reproduced; the command is next to it.

## How data reaches the browser today

`GET /api/expenses` runs `loadDataset` (`functions/_shared/db.ts`) and returns every table for the owner in one
document. The browser keeps all of it in memory, runs every engine in `src/domain/engine/` over the full
`Transaction[]`, clones the whole dataset on each mutation (`datasetPatches.ts`) and writes it to IndexedDB. The
daily backup calls `loadDataset` too.

The response carries a weak ETag made from a per-owner revision and the owner's budget month. A browser that
already holds the current version gets a 304 after two rows are read, before any dataset query or the
installment backfill. Every write replaces the revision (see "Dataset revision" in `docs/ARCHITECTURE.md`), which
costs two more rows written per write request.

## Constraints

- The app is built to run on the Cloudflare **Free** plan. The documented limits that shape the design (see
  Cloudflare's Workers limits and D1 limits and pricing pages, and re-check them before relying on a figure): 10 ms
  of CPU per request (Pages Functions bill as Workers), 50 D1 queries per invocation, 5M rows read and 100k rows
  written per day, 100 bound parameters per statement and 500 MB per database. `rows_read` counts rows scanned,
  not returned, and `COUNT(*)` is a scan. Every index adds a written row per insert.
- Offline is read-only: recent months and settings, no offline writes, no sync.
- Output must not change. The pure functions in `src/domain/engine/` are the reference for every number.

## Measured: the current load path, by ledger size

`SCALING_MEASURE=1 npx vitest run functions/_shared/loadDataset.scaling.test.ts` seeds a synthetic ledger
(`src/testing/syntheticLedger.ts`, 120 months) into an in-memory SQLite database with the real migrations, then
runs the real `loadDataset`. Node 22 on an Apple Silicon laptop. These are desktop numbers against an in-memory
database. "Server JS" is the load minus the time spent inside SQLite, a stand-in for Worker CPU and not a
measurement of it. A phone is typically several times slower on the client columns (4 to 8 times is a common
rule of thumb, not a measurement).

| Rows | Server JS | + stringify | Compact read* | JSON | gzip | parse | clone | rows read per load |
|---|---|---|---|---|---|---|---|---|
| 4.9k | 5.1 ms | 1.0 | 0.7 ms | 1.1 MB | 0.1 MB | 1.6 ms | 3.3 ms | 5.7k |
| 9.9k | 13.9 ms | 1.9 | 1.5 ms | 2.3 MB | 0.2 MB | 3.0 ms | 7.6 ms | 11.3k |
| 19.9k | 20.8 ms | 3.9 | 3.1 ms | 4.6 MB | 0.3 MB | 6.1 ms | 15.7 ms | 22.5k |
| 49.9k | 58 ms | 11.7 | 7.4 ms | 11.4 MB | 0.8 MB | 18 ms | 40 ms | 56k |
| 99.9k | 109 ms | 21 | 15 ms | 22.8 MB | 1.5 MB | 34 ms | 83 ms | 112k |
| 249.9k | 326 ms | 58 | 47 ms | 57 MB | 3.5 MB | 99 ms | 223 ms | 280k |

\* Raw column tuples straight to JSON, with no row mapping and no status derivation on the server (the client
would derive status from accounts and statements). "clone" is what every mutation pays today.

What the table shows:

1. **Worker CPU is the first limit to reach, at roughly 7,500 to 9,000 transactions on the Free plan.** Mapping and
   deriving status costs about 1.1 ms per 1,000 rows and stringify another 0.2, so 10 ms is crossed near 7,500 rows
   (9,000 without stringify). This is an estimate from Node. workerd's meter differs, so confirm it on a deployed
   Worker before relying on the figure.
2. A compact read moves that limit to about 65,000 rows, roughly 9 times further.
3. **The network is not the constraint.** gzip is 1.5 MB at 100k rows. Parse and clone are tens of milliseconds on a
   desktop up to 100k rows, but a phone pays 4 to 8 times that on every mutation.
4. **D1 rows read.** Every load reads every row, so the daily 5M budget covers about 440 loads at 10k rows, 90 at
   50k and 18 at 250k. An open that ends in a 304 skips the load, so the table counts opens that follow a change.
5. The backup runs the same load for every owner in one invocation, so it meets the same CPU limit. (The
   transaction list no longer renders every row: past 300 rows it draws only those near the screen, see
   `docs/ARCHITECTURE.md`.)

## Checked on a deployed D1

Read-only queries against a deployed database through the D1 query API:

- **The 100 bound-parameter limit is enforced.** A statement with 100 bound parameters runs; 101 fails with
  `too many SQL variables` (SQLITE_ERROR, code 7500). node:sqlite allows 32,766 variables, so tests that run on it
  (see `src/testing/sqliteD1.ts`) do not see this limit unless they enforce it.
- **One bound JSON string reads back as a list.** `id IN (SELECT value FROM json_each(?))` accepted 5,000 ids. The
  list itself counts as rows read (501 for 500 ids). Because of the 100-parameter limit, the app binds id lists this
  way (`functions/_shared/sqlIdList.ts`) instead of one parameter per id.
- **`COUNT(*)` is billed as a scan:** counting a table reports every row as read.

Not yet measured on a deployed Worker: CPU time, whether `batch()` counts as one query toward the 50, and rows
written per index.

## Proposed design

A **ledger** is made of:

1. **Reference data**, always local: categories, accounts, flags, labels, statements, cash actuals, settings,
   plans, scenarios, wealth accounts and check-ins. Bounded and small.
2. **Pinned rows**, always real and any age: every investment, and rows tied to a plan, flag or settlement. They
   feed portfolio return, instalments, flagged groups and reports, which read exact dates, signs and links.
3. **Hydrated months**: real rows for the months being viewed. Engines are relative to the viewed month, so the
   rows come from that month back far enough for the comparisons it makes, not from a fixed window ending today.
4. **Per-month sums** for every other month: one cell per (budget month, account, category, type, cancelled,
   sign) with the summed cents and a count. Only the engines that are linear in amounts receive them. Status is
   still derived on the client, from account settlement and statements.
5. **Server projections** for answers that depend on unbounded history.

When the ledger is small every month is hydrated and there are no sums, which is today's behavior, so there is
one code path with two policies.

| Feature | Runs |
|---|---|
| Month totals, budgets, yearly overview, cash reconciliation and close, statement amounts, goals flows, cash reserve, spending baseline, KPI totals | Browser, from real rows plus sums |
| Same-days KPIs, movers, spending groups and detail, pace, top transactions | Browser, from hydrated months |
| Recurring and Upcoming, fixed versus flexible, fixed costs, allocation | Endpoint returns the series; the detector finishes in the browser |
| Portfolio return, gap split, instalments, flagged groups, reports, reimbursement links | Browser, from pinned rows |
| Transaction list, count, net spend, search | Endpoint: keyset pages and a capped summary |
| Autocomplete beyond loaded rows, usage counts, one row by id, bulk edit on a filter, export, backup | Endpoint |

How much history each engine and screen reads, and which of them give a different answer from less, is recorded in
[ENGINE-HISTORY.md](./ENGINE-HISTORY.md).

Requests are split (reference data, months, sums, list, summary, series) so each has its own CPU budget and cache
key. Each will be checked against the per-owner revision that `GET /api/expenses` already uses (see "Status"), so most
opens end after a two-row read.

## Paged transaction reads

Three read routes serve the transaction list without loading the dataset. They are owner-scoped from the
session (never from a request value) and none of them writes, so none moves the dataset revision.

| Route | Answers |
|---|---|
| `GET /api/expenses/transactions/list` | `{ items, nextCursor }`: up to `limit` rows (default 50, at most 200, more is a 400) in `date DESC, id DESC` order |
| `GET /api/expenses/transactions/summary` | `{ count, capped, netSpendCents }` for the same filter |
| `GET /api/expenses/transactions/:id` | One row, or 404; a row that belongs to someone else gives the same 404 |

The filter is the engine's `TxnFilter`, one query parameter per field: `month`, `dateFrom`, `dateTo`,
`categoryId`, `accountId`, `type`, `status`, `flagId` (an id or `none`), `labelIds` (comma separated, any one
matches), `query`, `amountMinCents`, `amountMaxCents`, and `queryAmountFromCents` with `queryAmountToCents`.
Anything else is a 400: an unknown parameter (a misspelt filter that was ignored would answer with every row),
a value that cannot be read, a field given twice, or `limit` and `cursor` on the summary. Rows are the
`Transaction` the dataset carries, with the derived status and `labelIds` in ascending order. Statement-payment
rows are synthesized by the client and are not part of these reads.

**Paging is by position.** A cursor is the last row of a page and a digest of the filter, as base64url JSON. The
next page is the rows strictly after that position, so a row inserted or deleted between two fetches never
repeats or hides a row that was there throughout. A changed filter, or a cursor that was edited, is a 400. The
digest is not a signature and the cursor carries no owner; a hand-written position reveals only rows the
filter already allows.

**What differs from the engine, on purpose.**

- Text search uses `instr`, not `LIKE`, so `%` and `_` are plain characters and D1's 50 byte cap on a `LIKE`
  pattern does not apply. The search text is capped at 200 characters instead, and a longer one is a 400.
- SQLite lowers only ASCII, so each distinct non-ASCII letter in the search text has its capital folded into the
  lower-case one before the comparison (`CAFÉ` matches a search for `café`; so does `МОСКВА` for `москва`). Each
  such letter costs two bound values, so a search holds at most 8 different ones (more is a 400). Letters whose
  capital is not one character that lower-cases back (`ß`), Greek final sigma, the Kelvin sign and `İ` are not
  folded; the engine's `toLowerCase` treats those differently.
- A row whose account is missing counts as posted even when cancelled, as `deriveStatus` and `loadDataset` do.

**Cost.** A page reads the rows it returns plus any the filter rules out on the way, and stops at the limit.
`count` stops after 1,001 matches. `netSpendCents` is exact, so it reads every row the filter cannot rule out by
index: an unfiltered summary reads the owner's whole ledger, about the cost of one dataset load, and a month
or a date range reads only that range. Whether a deployed D1 bills these as expected has not been measured.

### Indexes

`migrations/0036_transaction_query_indexes.sql` adds two, each one written row per inserted transaction.
`transactionQueryPlans.test.ts` fails if either stops being used. The plans are for the first page and a later
one (`date<?` is the keyset position):

| Query | Before | After |
|---|---|---|
| Newest first | `idx_txn_owner (owner=?)`, then a sort of all the owner's rows | `idx_txn_owner_date (owner=?)`, no sort |
| Later page | same | `idx_txn_owner_date (owner=? AND date<?)` |
| Date range | same | `idx_txn_owner_date (owner=? AND date>? AND date<?)` |
| Month | same, so a past month is found by walking every newer row | `idx_txn_owner_month_date (owner=? AND budget_month=?)`, no sort |
| Month, later page | same | `idx_txn_owner_month_date (owner=? AND budget_month=? AND date<?)` |

The row id breaks ties in the same direction as the date (it is the rowid, stored last in every index), so
`ORDER BY date DESC, id DESC` needs no index column for it. A filter on category, account, flag or label can
instead be served by the index that names it, and the planner chooses. With table statistics it may read every
row of a common category on each page. That is not a problem at the sizes seen so far; if it shows up, the fix is
an `(owner, category_id, date)` index, one more written row per insert.

#### Proposed, not applied: drop two indexes

Two older indexes on `transactions` stop earning their written row once 0036 is in. This is a proposal only.
It is deliberately not a file in `migrations/`, because the deploy applies every file there on merge.

- `idx_txn_budget_month (budget_month)` is read by no statement the code runs: nothing filters on the budget
  month without the owner, and the new month index serves the one that does. It costs a written row per insert for nothing.
- `idx_txn_owner (owner)` is the first column of `idx_txn_owner_date (owner, date)`, so every lookup it serves
  is served by the new index with the same rows visited. The one statement that scans it (the backup's list of
  owners) reads one row per transaction either way.

Dropping both leaves `transactions` with the eight indexes it had before 0036, so the paged reads cost no extra
written rows per insert. `idx_txn_category` and `idx_txn_account` stay: category and account counts, reassigns
and foreign-key checks use them. To apply, as a new migration after checking the plans again on the deployed
database:

```sql
DROP INDEX IF EXISTS idx_txn_budget_month;
DROP INDEX IF EXISTS idx_txn_owner;
```

`transactionIndexUsage.test.ts` is the evidence. It runs the statements the repository issues for reads and for
the write paths (insert, update, bulk update, deletes, flag, label, category and account reassigns, the dataset
load) through `EXPLAIN QUERY PLAN`, shows none reads `idx_txn_budget_month`, and shows the plans scan the same
tables after both indexes are dropped. It does not cover SQL run by hand or by scripts outside `functions/`.

## Status

Built:

- the synthetic ledger generator and the SQLite stand-in for D1, and the measurement above;
- the per-owner revision (migration 0035) and the weak ETag on `GET /api/expenses` built from it, so an unchanged
  ledger is answered with a 304 and no dataset query;
- the windowed Transactions list, which draws only the rows near the screen past 300 rows;
- id lists bound as one JSON string, so bulk edit and delete work on more than 99 rows;
- the audit of how much history each engine reads ([ENGINE-HISTORY.md](./ENGINE-HISTORY.md)), with tests that pin it;
- the keyset list, the capped summary and the by-id read for transactions, with the two indexes they need
  (migration 0036). See "Paged transaction reads". Nothing in the app calls them yet.

Not built: the compact read and everything else under "Proposed design". Planned work, in dependency order:

1. Standalone improvements: a compact read (not built), the revision and ETag (built), list windowing (built).
2. A server query layer: keyset list, summary, by-id and query-plan tests (built); per-month sums and series (not
   built).
3. The ledger model and differential tests against the pure engines.
4. The client data layer: hydration, invalidation, snapshot per owner, version skew.
5. The Transactions tab on server pages, with selection and bulk edit on a filter.
6. The remaining consumers and a resumable backup.
7. Switching the default behind a runtime flag, with the old route kept for stale clients.

## Test tools

- `src/testing/syntheticLedger.ts`: a deterministic dataset of any size, in the shape and order the API returns,
  with fixed, quarterly and yearly series, plan instalments, flagged rows settled by a refund, negative
  investments, cancelled rows and refunds. Placeholder data only.
- `src/testing/transactionQueryKit.ts`: the awkward ledger (accents, `%` and `_`, ties on a date, withdrawals, a missing
  account), the stand-in with a record of every statement it ran (for the query-plan tests), and a seeded generator
  of filters, for the paged-read tests.
- `src/testing/sqliteD1.ts` and `seedSqlite.ts`: the real migrations and a D1-shaped wrapper over node:sqlite, so
  the real SQL runs in tests. It enforces the 100 bound-parameter limit but cannot reproduce D1's billing. They
  live in `src/testing/` because the `functions/` typecheck has no Node types.
