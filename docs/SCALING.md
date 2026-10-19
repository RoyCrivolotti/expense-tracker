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

- **An inserted transaction is reported as eight written rows**, the row and its seven indexes (the one added by
  migration 0038 is one of them), and a statement that updates a row and one indexed column as two. A `rows_read`
  of zero is reported for a `LIMIT 1` that is answered from an index alone.
- **Window functions, `group_concat(DISTINCT ...)`, a recursive query with correlated subqueries and
  `UPDATE ... FROM` over `json_each` run**, and D1 plans them as the test stand-in does: a search of an owner index,
  never a scan of `transactions`. `sqlite_version()` is refused ("not authorized to use function"), so the version is
  not readable.

Not yet measured on a deployed Worker: CPU time, and whether `batch()` counts as one query toward the 50. The plan for
measuring both, and the rows per statement and the table statistics, is under "Measuring on a deployed system".

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
| Recurring and Upcoming, fixed versus flexible, fixed costs, allocation | Endpoint returns the series (`GET /api/expenses/series`, built); the detector finishes in the browser |
| Portfolio return, gap split, instalments, flagged groups, reports, reimbursement links | Browser, from pinned rows |
| Transaction list, count, net spend, search | Endpoint: keyset pages and a capped summary |
| Autocomplete beyond loaded rows, usage counts, one row by id, bulk edit on a filter, export, backup | Endpoint |

How much history each engine and screen reads, and which of them give a different answer from less, is recorded in
[ENGINE-HISTORY.md](./ENGINE-HISTORY.md).

Requests are split (reference data, months, sums, list, summary, series, description matches, usage counts) so each has its own CPU budget and cache
key. The reference, months and sums are checked against the per-owner revision that `GET /api/expenses` already uses
(see "Ledger parts"), so most opens end after a two-row read. The series are served the same way, but they read the
whole ledger whenever the tag misses, which after any write it does: see "Recurring series" for what a client that
calls them has to do.

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

## Ledger parts

Three read routes hand out the pieces of a ledger described under "Proposed design", so that a client does not
have to load every transaction, and a fourth lists one transaction's receipts. Each is owner-scoped from the
session (never from a request value) and is a GET, so none moves the dataset revision. `GET /api/expenses` and
every write route are unchanged.

| Route | Answers | Bound |
|---|---|---|
| `GET /api/expenses/reference` | The reference tables, the pinned rows, the months that have a row, the rows in each, and the row count | None; see "What it costs" |
| `GET /api/expenses/transactions/months?from=YYYY-MM&to=YYYY-MM` | Every real row whose budget month is in the range, newest first, as `Transaction`s | 24 months and 5,000 rows |
| `GET /api/expenses/cube?from=YYYY-MM&to=YYYY-MM` | The per-month sums (`MonthCell`s) of the unpinned rows in the range | 120 months and 10,000 cells |
| `GET /api/expenses/attachments?transactionId=N` | One transaction's receipts, oldest first | None |

Both ends of a range are inclusive budget months. A missing, malformed, reversed or too wide range, an unknown
parameter and a repeated one are each a 400 before any row is read. A range whose rows or cells go over the bound
is a 400 as well, and the message names the bound. It is never cut short: a client given part of a month would add
up the wrong total. A month with more than 5,000 rows can only be read through the paged list with a `month`
filter. The bounds are constants in `src/domain/data/ledgerParts.ts`; the reasoning is under "What it costs".

### One revision across the parts

Every 200 body starts with `revision`, the owner's current token: the one the ETag of `GET /api/expenses` is built
from. The ETag of a part is the token, the owner's budget month, the part with a format number and, for a range,
the range, for example `W/"<token>-2026-10-months1-2026-01..2026-03"`. It names the range because a client that
keeps tags by hand could otherwise offer one range's tag for another and be told nothing changed. A matching
`If-None-Match` is answered with a 304 after two rows are read, before anything else runs, and every response has
`Cache-Control: private, no-cache`, as the dataset does.

Two responses whose `revision` differ were read from different states of the ledger: a write came between them,
or the budget month turned and the installment backfill ran. A client that wants one consistent ledger fetches
again. The revision is per owner, not per month, so after any write the part for an old range is fetched again too.

`PARTS_FORMAT` in `functions/_shared/datasetEtag.ts` is in every tag, as `DATASET_FORMAT` is for the dataset, and
`ledgerPartsEtag.test.ts` fails when the shape of a part moves without it.

### Reference

The body holds:

- `reference`: everything `loadDataset` reads except the transactions and the receipts (categories, accounts,
  flags, labels, statements, cash actuals, installment plans, scenarios, settings, wealth accounts and check-ins);
- `pinned`: the rows `isPinned` in `src/domain/ledger/pinned.ts` picks, whatever their age: investments, rows with
  a plan, a flag or a settlement, the rows another row was settled by, and payments with a covered count;
- `attachmentCounts`: for the pinned rows, `{ transactionId: receipts }` with an entry only for rows that have
  any. It replaces the dataset's `attachments`, which is the metadata of every receipt. It is a side map and not a
  field of the row, so a row is exactly what the dataset carries;
- `months`: every budget month with at least one row, a month of only cancelled rows included, oldest first (what
  the month picker steps through); `rowsPerMonth`, the rows in each, so that a client can stay inside the bound of
  the months route; and `rowCount`, their sum.

When the browser's copy is not current, the route runs the installment backfill that `loadDataset` runs, before it
reads anything, and fails the same way: an error is logged and the read goes on. It then reads the revision
again, so a backfill that inserted rows is already in the tag and in the `revision` of the body, and the next
request is a 304 and not a second full load. The months and cube routes run no backfill: in a new budget month,
until the reference has been fetched, an instalment that has fallen due is missing from them.

### Rows of a range

Rows are what `GET /api/expenses` carries, with the derived status computed in SQL by the same rules as the paged
reads (a missing account counts as posted) and `labelIds` in ascending order. Receipts of those rows are counted in
`attachmentCounts`. The statement reads at most one row more than the bound, so a range that is too big costs that
many rows and not the range, whatever it holds.

### Cube

A cell is what `buildCells` in `src/domain/ledger/cells.ts` makes: one per budget month, account, category, type,
cancelled flag and sign of amount, with the summed cents and a row count. A month that has only cancelled rows, or a
sum of zero, still has its cell. Pinned rows are not in any cell; they travel with the reference. The groups come
from a `GROUP BY` over the month range of `idx_txn_owner_month_date`, in the order `buildCells` returns them.

### What it costs

Measured on the SQLite stand-in with `SCALING_MEASURE=1 npx vitest run functions/_shared/ledgerParts.scaling.test.ts`,
Node 22 on an Apple Silicon laptop, over the synthetic ledger of 120 months. "JavaScript" is the read, less the
time spent inside SQLite, plus `JSON.stringify`: a stand-in for Worker CPU, not a measurement of it.

| Part | Size | JavaScript | JSON |
|---|---|---|---|
| Reference | 4.9k rows, 241 pinned | 0.9 ms | 82 kB |
| Reference | 99.9k rows, 1,125 pinned | 2 ms | 297 kB |
| Reference | 249.9k rows, 2,672 pinned | 3.8 ms | 674 kB |
| Rows | 1,000 rows | 0.2 to 0.3 ms | 230 kB |
| Rows | 5,000 rows | 1.1 to 1.4 ms | 1.15 MB |
| Rows | 10,000 rows | 2.1 to 2.8 ms | 2.3 MB |
| Cube | 12 months: 818 cells from 9.9k rows | 0.4 ms | 104 kB |
| Cube | 120 months: 8,156 cells from 98.7k rows | 3.1 ms | 1.03 MB |

- **The reference grows with its pinned rows, not with the ledger.** Pinned rows are 1 to 5% of the synthetic
  ledger. Its D1 cost does grow with the ledger, because counting rows per month reads one index entry per row, and
  D1 bills a count as a scan. An unchanged ledger is still a 304 at two rows.
- **Raw column tuples do not help the mapping.** Over plain objects and arrays, as a Worker receives them, the
  three ways of building a row (through `toStoredTxn`, building the object directly, and from `raw()` tuples) are
  within 30% of one another. Run on the stand-in's own row objects, tuples look four times faster, but that is
  node:sqlite's row objects being slow to read; workerd hands a Worker plain objects, so the scaling test copies
  the rows through JSON before it times the mapping. Tuples are 2.7 times smaller than named columns before they
  reach the Worker (688 kB against 1,889 kB for 5,000 rows); what that saves in workerd is not measured, so the
  routes keep named columns.
- **The bounds are conservative, not derived.** 5,000 rows is about 1.3 ms of JavaScript here, and 10,000 cells
  about 4 ms. That leaves most of the Free plan's 10 ms for what cannot be measured here: the Worker's own cost of
  receiving rows from D1, the statements that authenticate the request, and workerd's meter against Node's. Raise
  them only after measuring a deployed Worker. A cube of the whole synthetic 120-month ledger of 99k rows has
  8,156 cells, so 10,000 serves a ledger of that kind in one request; one with more accounts and categories asks
  by the year.
- **Rows read are not measured.** Estimated from the plans: the reference reads one index entry per row (the month
  counts) and one row per pinned row; a rows request reads at most its bound plus one index entries and the rows
  it returns; the cube reads an index entry and a row for every row in the range. The cube therefore saves Worker
  CPU and bytes, not D1 reads: a cube of the whole ledger reads the whole ledger. What would is a table of
  per-month sums that every write keeps current, which is a change to the write path and not built.

### Indexes

`migrations/0037_pinned_rows_index.sql` adds one partial index, `idx_txn_pinned (owner, date)`, holding only the
rows `isPinned` picks by their own columns. Without it the pinned rows are found by reading every row the owner has:
plans, flags and settlements have an index, but investments and payments with a covered count do not.
`ledgerPartPlans.test.ts` runs each statement through `EXPLAIN QUERY PLAN`, with and without table statistics and
among several owners, and fails on a full scan of `transactions`, on a read of every row the owner has, and on a
pinned read that stops going through the index.

| Query | Without 0037 | With 0037 |
|---|---|---|
| Pinned rows | Every row of the owner, through one of the owner indexes | `idx_txn_pinned (owner=?)`, already in date order |
| Payments another row points at | `idx_txn_settled_by`, then each row by key | The same |
| Range of months | `idx_txn_owner_month_date (owner=? AND budget_month>? AND budget_month<?)`, one sort | The same |
| Cube | The same range, and `idx_txn_settled_by` for the settled rows | The same |
| Rows per month | `idx_txn_owner_month_date (owner=?)`, index only | The same |

An ordinary expense is not in the partial index, so inserting one costs no extra written row; an inserted
investment, plan row, flagged row or settled row costs one. The index is keyed on the date so that the rows come off
it newest first with no sort: keyed on the id, SQLite chose to walk the date index to avoid the sort and read every
row. The predicate has to hold the same terms as `PINNED_SQL`, or SQLite stops using it.

The cube has no index of its own. A covering index over the month range and all the columns the cube and the pinned
test read (eleven of them) made the statement 1.6 times faster on the stand-in (36 ms against 59 ms for 97k rows),
for a wide index and one more written row on every insert, when `transactions` already has eleven. It was not built.

## Recurring series

`GET /api/expenses/series` answers `{ series }`: every recurring series in the owner's history, newest first, as
`RecurringSeries` (`src/domain/engine/recurringSeries.ts`). A series is the rows that share a normalized
description, account, category and type, leaving out cancelled rows, blank descriptions and the payments of an
instalment plan, when there are three or more of them. The detectors cannot run on the few months a browser holds,
because three rows make a series and the median and regularity run over every gap; with the served series they
can. A browser builds the classifier and the groups the engines take with
`classifierFromGroups(recurringFixedGroupsFromSeries(series))` and `recurringFixedGroupsFromSeries(series)`, and
`detectUpcoming` and `stillStopped` take the series the same way (see `src/domain/engine/recurringSeries.ts`).

**What a series carries.** The newest row's description, amount, account, category and type; its newest 5 dates
(`SERIES_TAIL_DATES`); the days between every pair of consecutive dates before those, in ascending order of size;
every distinct budget month; and the budget offset of its newest 3 rows. That is what each detector reads, found by
reading them (the table is in [ENGINE-HISTORY.md](./ENGINE-HISTORY.md#reading-a-series)). It is more than the
earlier proposal of every gap and the newest 5 dates: the pace envelope and the fixed cost list ask whether a series
has a row in a month the screen shows, which can be years back, so they need every budget month.

**Held to the engine.** `dbSeries.parity.test.ts` checks that the SQL serves exactly what `seriesFromTransactions`
builds from the same rows, in the same order, on 80 seeded random ledgers, the 60 month adversarial ledger, a large
regular ledger and a ledger of series spelled with accents, other whitespace and other capitals.
`seriesConsumers.parity.test.ts` runs every consumer in ENGINE-HISTORY.md from the served series and the rows of a
13 month window, for every viewed month, closed and open, and compares it with the same consumer over every row:
only the three lists that are global by nature differ (the eight newest rows by date and by creation time, and the
list over every date). Upcoming charges and stopped series are compared on a spread of days.
Mutating the SQL (grouping on `lower(trim(description))`, keeping plan rows, keeping cancelled rows, a two row
minimum, an off by one in the tail, the gap, the order) fails them.

**Exact for non-ASCII text: `description_norm`.** The app groups by `normalizeDesc`, JavaScript's `trim()` then
`toLowerCase()`. SQLite's `lower` changes ASCII letters only and its `trim` strips spaces only, so grouping in SQL on
`lower(trim(description))` splits "CAFÉ" from "café" and keeps a tab around a word as part of it; the parity test
shows the two groupings differ on its ledger. Other designs were weighed and not taken: SQL for ASCII rows plus
JavaScript for the rest breaks on letters whose JavaScript lower case is ASCII (the Kelvin sign lowers to `k`), so a
series would have rows in both sets and need merging, and a prefix search would need the same two paths; computing the
key in the Worker for every row on every read is a full read of the owner's descriptions at about a millisecond of
CPU per thousand rows, the cost this design exists to avoid. So the key is stored.

Migration `0038_description_norm.sql` adds `transactions.description_norm`, written by the same JavaScript function
in every statement that writes a description: create, update, bulk update, bulk insert (which creates one row at a
time), the instalment backfill, and the seed generators in `scripts/`. `descriptionNormWrites.test.ts` reads the
source of `functions/`, `scripts/`, the SQLite seeding helper and any later migration for an INSERT or UPDATE that
writes a description without it, and `descriptionNorm.integration.test.ts` drives every route that can write one
and compares the whole column with the function afterwards. Breaking any of the four write paths fails it.

The index `(owner, description_norm, date)` costs one written row per inserted transaction and one more whenever a
description or a date changes. It is worth that because it is the only thing that lets a prefix search (the next
piece) read a range of the owner's descriptions instead of every row, and find the newest row of a description with
one seek (the date is in the key for that). It also serves the series read and the lookup for rows still waiting
for a value (NULL entries sort first). `seriesPlans.test.ts` and the backfill tests fail on a scan of
`transactions`, with and without table statistics. They caught one planner choice worth knowing: asking for the
waiting rows in id order made SQLite walk every row of the owner through `idx_txn_owner` to avoid a sort, so the
read has no ORDER BY and takes the rows in index order (by date, then id).

**The backfill.** A row that predates the column holds NULL, and the migration does not fill it because SQL cannot.
`fillDescriptionNorm` (`descriptionNormBackfill.ts`) fills some of the owner's NULL rows, 500 a pass, four passes at
most per request: two queries a pass (one read, one UPDATE that takes the values as one bound JSON string, so the 100
parameter limit is not in play), a normalize per row, and one `JSON.stringify`. A pass stops early at 40,000
characters of JSON (counted as sent, so a quote weighs two) when descriptions are very long, so one bound string stays small. NULL is the only state, so it is idempotent and resumes
where it stopped, a row filled by something else in between is left alone, and another owner's rows are never
touched. The series request runs it first and answers 503 while rows are still waiting, because grouping before then
would leave rows out; each retry gets further. It does not move the dataset revision: the column is in no
response. It costs two written rows per existing transaction, once (the row and its index entry, as D1 reports them; 200
rows reported 400 written), and about four read. Building the index in the migration writes one row per transaction
as well, so on the Free plan a ledger of about 33,000 transactions uses a day's write budget for the migration and the
fill together, and the fill resumes the next day if it runs out. The statement that writes a pass is written so
that the JSON list is the outer loop (a `+` before the target's columns): SQLite's own choice scanned the whole list
once per waiting row, which D1 reported as 250,000 rows read for a pass of 500.

**Cacheable.** The route is served like the ledger parts: the body is `{ revision, series }`, the tag is
`W/"<token>-<budget month>-series<PARTS_FORMAT>"` from the owner's dataset revision, and a request that holds it gets
a 304 after two rows are read, before any series is computed. Only a write changes the answer, and the installment
backfill that the other parts run is not needed, since a plan's payments are not part of a series. As with the
dataset, the tag is read before the data. Any query parameter is a 400. `series.integration.test.ts` fails when the
JSON shape moves without `PARTS_FORMAT` moving.

**Cost.** One statement over the owner's counted rows, once, so it reads every one of them: it is a whole history
read, not a page. Measured with `SCALING_MEASURE=1 npx vitest run functions/_shared/series.scaling.test.ts
--reporter=verbose` on the synthetic ledger (120 months, in-memory SQLite, Node 22 on an Apple Silicon laptop).
"Server JS" is the request minus time inside SQLite, a stand-in for Worker CPU, not a measurement of it.

| Rows | Series | Server JS | SQLite | JSON | gzip | Parse | Classifier from series | from rows |
|---|---|---|---|---|---|---|---|---|
| 4.9k | 391 | 2.3 ms | 14 ms | 141 KB | 22 KB | 0.3 ms | 1.8 ms | 5.2 ms |
| 19.9k | 464 | 2.1 ms | 50 ms | 309 KB | 50 KB | 0.7 ms | 1.7 ms | 21.7 ms |
| 49.9k | 661 | 4.8 ms | 155 ms | 566 KB | 66 KB | 1.3 ms | 2.3 ms | 68.6 ms |
| 99.9k | 762 | 8.8 ms | 296 ms | 816 KB | 67 KB | 2.1 ms | 3.1 ms | 113 ms |
| 249.9k | 779 | 16.7 ms | 729 ms | 1.2 MB | 69 KB | 2.9 ms | 3.9 ms | 297 ms |

1. **Worker CPU** is 8.8 ms at 99.9k transactions for the work counted here, which does not include stringifying the
   response (1.2 ms at that size) or the Worker's own handling of D1's result, so the 10 ms limit is crossed between
   75,000 and 100,000 transactions, against about 7,500 for the dataset load. Most of it is turning the gap lists into
   numbers; a typed array and its native sort (`numbers()` in `dbSeries.ts`) took that from 10.5 ms to 4.7 ms at 95,000
   gaps. These are Node figures; workerd's meter differs.
2. **Rows read per recompute**: D1 reports about nine per counted transaction (the two window sorts count), measured
   on a deployed database with the REST API. That is 0.9 million at 100,000 transactions.
   **This is a cost per recompute, not per day**, and every write moves the revision, so every write makes the next series
   request a recompute: 20 of them at 20,000 transactions (about 240,000 reads each) or 4 at 100,000 use the Free plan's
   whole daily 5M, which every other read and write of every owner shares. An unchanged ledger is a 304 and two rows.
3. **What the client that calls this has to do.** Fetch the series when a screen needs them (Upcoming, fixed costs, the
   fixed or flexible split), not on every open and not after every write. Rows the browser holds that are newer than the
   revision the series were served at are not in them (`detectUpcoming({ groups })` ignores the rows it is given, so a charge
   logged since keeps showing), so the client either folds those rows into the series or accepts one refetch. The
   structural fix, not built, is a revision of the series' own that moves only for writes that change a description,
   date, budget month, account, category, type, cancelled flag, plan link or amount, so that flag, label, note and
   statement edits stay 304s; usage would have its own for the writes that change a count.
4. **Size** grows with the number of series times the distinct months each was booked in, more than with the gaps:
   on the synthetic 100,000 row ledger the budget months are about half of the 816 KB and the older gaps under a third.
   The browser discards non-recurring series after one pass (`classifier from series`, 2 to 4 ms against 5 to 300 ms from
   the rows). If the payload matters, a server-side prefilter is exact (none of the recurring rhythms has a median gap
   under 25 days, so a series with fewer than half of its gaps at 25 days or more can be left out, budget months and
   all), and run-length encoding the gaps roughly halves their bytes. Neither is built: the first couples the server to
   the rhythm thresholds.
5. **Checked on a deployed D1** (the repository's own code, over the REST API, against the dev database): the series
   equal the reference for every owner there, every stored `description_norm` equals `normalizeDesc`, a first request
   on a ledger of about a thousand rows fills it and answers in one go (the fill is about four rows read and two
   written per row filled, plus the series' nine read per row), and a later one is two statements.
6. **Not measured**: Worker CPU on workerd. Every write route now checks that a date is a real calendar day and a
   budget month a real month, so a row like `2026-13-01` cannot be written; a row written before that check would be
   read by the series statement and by the engine differently (none was found in the dev or production database when
   they were counted, read-only).

## Description autocomplete

The browser suggests descriptions from an index of the rows it holds (`buildDescriptionIndex`,
`src/data/descriptionIndex.ts`). Once it holds only the newest months, descriptions that were last used earlier
have to come from the server: `GET /api/expenses/descriptions/suggest` answers for the rows booked before the
ones the browser holds, and the browser merges the two.

| Parameter | Meaning |
|---|---|
| `q` | What was typed, 1 to 140 characters once trimmed. The server normalizes it as the index does (`trim()`, then `toLowerCase()`) |
| `before` | A budget month, `YYYY-MM`, optional. Only rows whose budget month is before it count. The browser sends the oldest month it holds, so the two sides together are every row. A date is a 400 |
| `limit` | 1 to 25, default 8, the index's own default. Decimal digits only (`0x10` and `1e1` are refused), and more than 25 is a 400 |
| `locale` | A language tag, optional. Letters sort by it, so send the browser's own (`Intl.Collator().resolvedOptions().locale`). When it is absent the Worker's own locale sorts, which is not the browser's. A tag the server has no sorting rules for is a 400 |

The answer is `{ items, tooBroad }`: up to `limit` descriptions that start with `q`, each as the newest row of that
description speaks for it (`label` as typed, `template` with its type, category and account, and the `date` and
`id` of that row), in the order the browser's index lists them. Cancelled and blank rows are out. Any other
parameter is a 400, the owner included. The response is `Cache-Control: private, no-store`: it follows every write
and is for one prefix, so nothing should keep it.

**Why a month and not a day.** The browser holds its rows by budget month (`/transactions/months`), and a row's date
and budget month can differ by a month at the rollover. With a day as the cut a row dated after the cut but booked
before the browser's oldest month is in neither set. With the browser's oldest month as the cut, a row is in the
browser's set if its budget month is that month or later and in the server's if it is earlier, so every row is in
exactly one.

**Merging.** `mergeDescriptionMatches(own.searchEntries(q, limit), items, limit, locale)` (the browser's index built
with `order: 'key'`) takes both lists, lets the newer row (by date, then id) speak for a description both found,
sorts, and keeps `limit`. The result is what the index gives over every row, on three conditions: the browser holds
every row booked from the `before` month on (with fewer, rows are missing from both sides); the browser sends its
locale; and the browser's ICU and the Worker's sort the same text the same way. The last one is not something a
test in one process can show, and for a rare script the two can differ by an ICU version. It is true of the first
`limit` of the whole because a description's place in the order depends only on its normalized text, never on which
of its rows is newest, so the first `limit` of the whole are among the first `limit` of either part. It is tested on
generated ledgers for every split, prefix and limit (`src/data/descriptionMerge.test.ts`, and with the real SQL in
`dbDescriptionSuggest.parity.test.ts`), including accents, capitals, padding, descriptions the collator calls equal,
ties on a date, rows the browser holds that are older than its window (pinned rows), and Swedish and Spanish
sorting.

**Two orders in the browser's index.** The app's index sorts by the newest row's label and leaves descriptions the
collator calls equal ("Cafe", "Café") in the order the rows happened to arrive. Sorted that way, a description could
move when a newer row of it spelt it differently, and two parts could not be merged exactly. So the index takes an
`order` option: `label`, the default, is the original and what the app uses today (a test holds it to a copy of the
original algorithm on generated ledgers), and `key` sorts on the normalized text with ties broken by the text itself,
which is the order the server answers in. The `label` order is not for merging: a merge over a list in that order
puts padded and equal-sorting descriptions in the wrong places. The change that makes the app read older matches from
the server passes `order: 'key'` and deletes `label`. The two differ only for a description with spaces around it and
for ones the collator calls equal.

**What is exact and where the answer is cut.**

- SQLite cannot sort as `localeCompare` does (it has no such collation), so the statement finds the matching
  descriptions and the Worker sorts them with the same `Intl.Collator` and tie-break the browser uses
  (`src/domain/engine/descriptionSearch.ts`).
- A prefix that matches more than 500 different descriptions of the owner is answered with `tooBroad: true`, a 200
  and no items, never with a list cut short of the true first eight. That is an ordinary answer for a letter or two
  of typing, not an error: the browser keeps showing the matches among its own rows and asks again when the person
  types more. The 500 counts every description of the owner that starts with the prefix, whatever its status or
  month, because the walk takes every one; a prefix can be too broad although few of its descriptions would be
  answered. The sort is the one step that runs in the Worker, and 500 keeps it to about a millisecond; a `tooBroad`
  answer does not build the collator or sort at all.
- Grouping and matching are on `description_norm`, the stored JavaScript normalization (see "Recurring series"), so
  the prefix `CAFÉ` finds `café`, which SQL's `lower` would not do. The range is the prefix up to the string just
  above every string that starts with it, compared as bytes, which is code point order.
- A route that groups by `description_norm` answers 503 with `Retry-After: 1` while rows still wait for one, as the
  series route does. It writes `description_norm` on a GET and does not move the dataset revision.

**Cost.** The statement skips from one description of the prefix to the next with one index seek each, reading the
index alone, and then finds the newest eligible row of each with another seek. It does not walk every row that starts
with the prefix. The first seek of a description reads the rows of it booked from `before` on (the ones the browser
holds) one at a time until it reaches an eligible one, so the rows read are a few per description plus the rows of
that description inside the browser's window. The plan test shows three index searches and one row lookup and no scan
or sort, with and without `before` and with and without table statistics; it caught the planner choosing the
budget-month index for the second seek, which reads every row of the owner before the month once per description
(the `+` before `budget_month` in `descriptionSuggestSql.ts` stops that). An earlier version walked the prefix's
rows and cost, on the synthetic ledger at 250k rows, about 86,000 rows and 80 ms of SQLite time for the letter "c";
this one takes about 0.1 ms there, flat from 5k to 250k rows (`SCALING_MEASURE=1 npx vitest run
functions/_shared/descriptionSuggest.scaling.test.ts --reporter=verbose`). The Worker's own work (sorting at most 500
strings) is 0.3 ms for 500 random keys in Node. The first `Intl.Collator` of a process costs about 5 ms in Node and
0.01 ms after that; on a cold Worker isolate the first suggestion pays it, and a request that is `tooBroad` does not.
On a deployed D1, run through the repository's own code over the REST API, the earlier statement (with the day as
the cut, before this change) was accepted and planned as in the plan test, answered exactly what the browser's index
does, and was reported as reading about four rows for each matching description. The statement now in the repository
has been planned and compared with the index on SQLite only.
Not measured: Worker CPU on workerd, the statement on a deployed D1, and whether the Worker has sorting rules for
every locale a browser reports (a missing one is a 400 and the browser falls back to its own matches).

## Usage counts

`GET /api/expenses/usage` answers how many records name each of the owner's categories, accounts, flags and labels.
The Settings lists show these counts and ask for a reassignment before deleting a record that has any
(`categoryUsageCount` and `accountUsageCount` in `src/ui/definitions/recordUsage.ts`, and the counts in the flag and
label lists), which is what the server checks as well (`countCategoryUsage` and `countAccountUsage` in `dbConfig.ts`).
Today they are counted over every row the browser holds; a browser that holds only some months cannot.

```
{ revision, categories: [{ id, transactions, plans }],
            accounts:   [{ id, transactions, plans, statements }],
            flags:      [{ id, transactions }],
            labels:     [{ id, transactions }] }
```

Every category, account, flag and label of the owner is listed, with zeros, each list in ascending order of id. A
count is the number of records of that kind that name it: `transactions` of any status (cancelled rows and the
payments of an instalment plan included, as the lists count them), `plans` for a category or account, `statements`
(paid or not) for an account, and a transaction once per label it carries. Nothing but the owner's own records is
counted, whatever ids another owner's rows name. The route runs the installment backfill when the browser's copy is
not current, as `GET /api/expenses` does, so the payments it adds are counted as the dataset counts them.

**Held to the dataset.** `dbUsage.parity.test.ts` checks that the SQL serves exactly what `usageFromDataset` computes
from the dataset the API serves, on 80 seeded random ledgers, the adversarial ledger and others; that each count
equals what the Settings lists compute from every row; and that delete and reassign go the way the counts say, which
is the server's own behaviour: a category or account with a count of zero deletes outright and one with any is refused
with a 409 until its rows are moved. It also plants another owner's plan, statement, tags and transactions naming
this owner's ids and checks none is counted.

**Cost.** One statement, one query. The transactions are counted in a single pass of the owner's rows grouped by
category and account, which gives both counts at once; the rest is the owner's plans, statements, flags and
labels, and the rows that carry a flag (`idx_txn_flag`, which holds only those) or a label (found from the owner's
labels through `idx_transaction_labels_label`). `usagePlans.test.ts` fails on a scan of `transactions` or
`transaction_labels`, and on a walk of an index with no owner in it. That is not an academic check: once the planner
had table statistics it chose `idx_txn_category`, which has no owner, to produce the groups in order, and would have
read every owner's transactions to count one owner's. Grouping by `category_id + 0` removes that choice. The choice
only appears in a database with a single owner and statistics (with several owners the owner index is selective and
wins anyway), so the test runs that shape as well. Measured with
`SCALING_MEASURE=1 npx vitest run functions/_shared/usage.scaling.test.ts --reporter=verbose` on the synthetic
ledger (in-memory SQLite, Node 22):

| Rows | SQLite | Server JS | Response |
|---|---|---|---|
| 4.9k | 0.9 ms | 0.1 ms | 1.0 KB |
| 19.9k | 4.0 ms | 0.1 ms | 1.0 KB |
| 49.9k | 12 ms | 0.2 ms | 1.0 KB |
| 99.9k | 29 ms | 0.2 ms | 1.0 KB |
| 249.9k | 70 ms | 0.2 ms | 1.0 KB |

The statement reads every transaction of the owner once. D1 reports it as about two rows read per transaction (the
index entry and the row, as the grouped columns are not in the index), plus about two for each label link, since a
transaction is found again from each label it carries. That is about 200,000 at 100,000 transactions and 500,000 at
250,000, 4% and 10% of the Free plan's daily 5M, for the first Settings open after a change, and more for a ledger
that tags most of its rows; the same revision tag as the ledger parts makes every open after that a 304 and two
rows. Server CPU is negligible; the answer is a kilobyte. Counting each id through `idx_txn_category` and
`idx_txn_account` would read the owner's rows once for categories and again for accounts, and a stored counter would
cost a written row on every transaction change; neither was built.

**What D1 refused.** The first version of the statement had seven terms in its compound SELECT. A deployed D1 allows
five and answered "too many terms in compound SELECT", which SQLite itself, and so every test on the stand-in, does
not. It was found by running the repository's own code against the dev database, and it now uses exactly five
(`usagePlans.test.ts` fails on a sixth). Against the dev database the counts equal the reference for every owner.
Not measured: workerd CPU, and whether a deployed D1 keeps table statistics (it had none when read; the plan is held
to the owner's index with and without them).

## Measuring on a deployed system

Four things in this document are still estimates that only a deployed system can settle: the Worker CPU each route
uses against the Free plan's 10 ms, the `rows_read` and `rows_written` D1 bills for each statement, whether
`batch()` counts as one query toward the 50 a Worker may issue per invocation, and whether a deployed D1 keeps table
statistics. This section is the plan for measuring them without making the app unusable and without touching
anyone's data, and the tooling that carries it out. Nothing here has been run against Cloudflare. The tooling is
tested against the SQLite stand-in only, and every figure taken from Cloudflare's documentation names its page and
the date it was read.

### The limits that bind

Read on 2026-10-19; each page's own last-updated date is in brackets.

| Free plan | Value | What the page says about scope |
|---|---|---|
| D1 rows read | 5 million a day, reset 00:00 UTC | [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) [2026-04-21]: in the "Workers Free" column. "When your account hits the daily read and/or write limits, you will not be able to run queries against D1." It never says per database. Storage on the same page is "the sum of all databases in your account" |
| D1 rows written | 100,000 a day | The same page and wording |
| D1 queries per Worker invocation | 50 | [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) [2026-04-21]. The page says per-statement limits apply "to each individual statement contained within a batch" and is silent on how a batch counts toward the 50 |
| Workers requests | 100,000 a day, for the account | [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) [2026-10-12]. [Pages Functions pricing](https://developers.cloudflare.com/pages/functions/pricing/) [2026-09-08]: Functions requests "count towards your quota for the Workers Free plan"; static assets do not count |
| Worker CPU | 10 ms per HTTP request. Waiting on `fetch`, KV or database queries does not count | Workers limits. Past it the request fails with error 1102, which Pages Functions metrics list as "Exceeded Resources" |
| Time Travel | 7 days of history | D1 limits |

**Treat the D1 daily limits as one budget for the whole account.** The pages say the account reaches them. They do
not say in so many words that databases share them, but being wrong in that direction costs the production app its
writes, so the plan assumes the worst. Production, the development database (used by every PR preview and the
staging site) and the backup Worker all draw on the same 100,000 writes and 5 million reads. Seeding the
development database spends the production app's budget. When the budget runs out D1 refuses every query in the
account until 00:00 UTC, or until the plan is upgraded, which the pricing page says takes "typically within minutes".
Nothing is lost; the app just cannot save, and later cannot read. The 100,000 Workers requests a day are a separate
budget, and a REST call to the D1 API is not a Worker request, so the measurement below spends none of them.

### What an insert costs

D1 reports a written row for the table row and one for every index entry. `transactions` has twelve indexes, seven
of which hold every row:

| Index | Migration | Holds |
|---|---|---|
| `idx_txn_budget_month`, `idx_txn_account`, `idx_txn_category` | 0001 | every row |
| `idx_txn_owner` | 0003 | every row |
| `idx_txn_owner_date`, `idx_txn_owner_month_date` | 0036 | every row |
| `idx_txn_owner_desc_norm` | 0038 | every row |
| `idx_txn_plan_installment` (unique), `idx_txn_plan` | 0009 | rows of an instalment plan |
| `idx_txn_flag` | 0015 | flagged rows |
| `idx_txn_settled_by` | 0018 | rows a reimbursement settled |
| `idx_txn_pinned` | 0037 | investments, and rows with a plan, flag, settlement or covered count |

An ordinary expense writes 1 + 7 = **8 rows**, which is what D1 reported when it was measured (see "Checked on a
deployed D1"); a row in every partial index writes 13. A label link writes 4 (its row, its UNIQUE pair and two
indexes). The synthetic ledger's mix averages 8.4 rows a transaction. `scripts/scaling/budget.test.ts` keeps this
from going stale: it counts the indexes in the migrated schema and the entries a seeded ledger really puts in them,
so a migration that adds an index fails it until the figures here are updated. Deleting a row is assumed to write
as many rows as inserting it did, because the index entries go too; the run's spend ledger stops it if that is wrong.

### The budget

**Caps for the whole exercise**, because the same budget serves the production app: at most 25,000 rows written in
total (a quarter of one day) and 15,000 on any one UTC day; at most 500,000 rows read in total (a tenth of a day) and
300,000 on any one day. Independent of those, a run refuses to start, and stops, once the account as a whole has
written 40,000 rows or read 1.5 million that day, so at least 60% of the writes and 70% of the reads are left for the
app whatever goes wrong. One statement can overshoot a cap by at most one chunk (500 rows, about 4,000 written
rows).

A seed of N transactions costs about 8.4 N to insert and the same to delete, plus about 200 rows of reference data
(`node scripts/measure-d1.mjs plan --transactions N` prints this; the write routes add about 800):

| Transactions | Insert | Reference | Write routes | Seed and measure | Clean up | Total |
|---|---|---|---|---|---|---|
| 303 | 2,549 | 90 | 800 | 3,439 | 2,639 | 6,078 |
| 613 | 5,195 | 120 | 800 | 6,115 | 5,315 | 11,430 |
| 910 | 7,683 | 154 | 800 | 8,637 | 7,837 | 16,474 |
| 1,215 | 10,255 | 184 | 800 | 11,239 | 10,439 | 21,678 |
| 1,366 | | | | | | 24,298 (the largest that fits) |

Two sizes are needed to tell a per-row cost from a fixed one. **The plan is a seed of 303 transactions on one day
and 910 on a later one**, each cleaned up on a day after its measuring or on the same day if it fits: 22,552 rows
written in all (22.6% of one day's budget, never more than 8,637 on a day). The read passes cost about 60,000 rows
(a pass over every route reads about 10,000 rows at 303 transactions and 20,000 at 910, estimated from the query
plans; the run measures it, and runs the routes with and without the write cases), and each fingerprint reads about
one row per row the development database holds. Writing the first 20 transactions of a seed is a calibration: if
D1 reports more than 25% over the plan for them, the run stops having spent about 160 rows.

### Rules, and what enforces each

| Rule | Enforced by |
|---|---|
| Never touch production | `guard.ts`: the name `roy-expenses` is refused before config or credentials are read. A target must also match `config/dev.json`, end in `-dev`, differ from the id the backup Worker's `wrangler.toml` binds to production, and match what Cloudflare itself reports for that id. Writes need `--write` and `--confirm <database>` repeating the name |
| Write only as the synthetic owner | `scaling-check@example.com`. `example.com` is reserved for documentation (RFC 2606), so nobody can sign in as it, and `scripts/check-pii.mjs` already accepts it. Every write statement must name an owner column and bind that address, or it is refused before it is sent. The schema is never changed: DDL is always refused |
| Removable by an owner-scoped delete | `cleanup.ts` deletes by owner, a table at a time, transactions in chunks of 500 with their label links. `seedCleanup.test.ts` fails if a migration adds a table with an `owner` or `email` column that the list does not know |
| Provably nothing else touched | See "Proving nothing else was touched" |
| The app stays usable | The caps above, the calibration stop, one statement at a time, and a stop file (`.tmp/scaling/stop`) checked before every statement |

Ids of the synthetic rows start 1,000 above the largest id each table holds when the seed runs, so they cannot
collide with anyone's rows.

### What has to be provided

Nothing is created or requested by this plan. To run it the maintainer provides:

| What | Needed for | Without it |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the environment of the command. The token needs Account, D1, Edit: the REST query endpoint is one endpoint for reads and writes, and the pages read do not say whether a read-only D1 token may call it. Try the read-only token for the read commands first; the script's own guard blocks writes without `--write` either way | every command except `plan` and the dry runs | `plan`, `seed` and `cleanup` without `--write`, and all the tests, run offline |
| `config/dev.json` (exists on the maintainer's machine) | everything that connects | none |
| Account, Account Analytics, Read on the token ([GraphQL analytics token](https://developers.cloudflare.com/analytics/graphql-api/getting-started/authentication/api-token-auth/) [2026-04-23]) | reading how much of today's budget the whole account has used | read the number off the dashboard (D1, Metrics) and pass `--account-written-today N` |
| A Cloudflare Access service token | only the deployed-route approach below, which this plan does not recommend: a service token's payload carries a `common_name` and an empty `sub` and no email ([application token](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/) page), and `resolveAuthenticatedEmail` answers 401 without one | not needed |

### The ways to measure, and what each leaves unmeasured

| Approach | Tells you | Leaves unmeasured | Cost |
|---|---|---|---|
| **(a) The repository's own routes, run in Node against the development database over the REST API** (built: `scripts/measure-d1.mjs`). The route handlers and middleware run unchanged; a D1 adapter sends each statement to the REST API and records `rows_read`, `rows_written` and `duration` | Exact rows billed per statement and per route, with the real plans and the real statistics state; the number of statements and D1 calls per request, counted both ways (see below); a slope per 1,000 transactions from two sizes | Worker CPU. How a Worker is billed for a batch. Anything above 910 rows is an extrapolation | 22,552 rows written, about 100,000 read; needs the token |
| (a, by hand) Hand-picked statements through the same API | A subset of (a), less faithful: it misses statements nobody thought of | The same | The same |
| **(b) The built Functions under local workerd** (`wrangler pages dev`, local D1) | The real runtime's CPU shape: which route dominates, and the ratio of workerd to Node | Billing (local D1 is not Cloudflare's), and absolute CPU, since it is the maintainer's machine. Not built: needs the migrations and the seed applied to a local D1 | No Cloudflare rows, no token. Local D1 is simulated unless a binding says `remote` ([local development](https://developers.cloudflare.com/workers/local-development/) [2026-10-18]); use a throwaway database id so it cannot reach a real one |
| (c) A preview deployment read through `wrangler pages deployment tail` | Pass or fail at the real 10 ms, as "Exceeded Resources" | CPU in milliseconds: the output documented for Pages has no CPU field (whether the live payload carries one is unconfirmed and costs one request to check); Workers Logs, Logpush and Tail Workers are Workers Paid features, and Pages metrics list requests, errors and invocation statuses only. The synthetic owner cannot be used: it cannot sign in, and a service token carries no email, so every route answers 401 | Needs a real signed-in user, so it can only read the maintainer's own staging data |
| **(d) Free evidence that already exists** | Four facts, no rows spent: the transaction count production holds (the app shows it) against the fact that `GET /api/expenses` works on the Free plan, which bounds CPU at that size; the **backup Worker's CPU per execution** and invocation statuses (Workers & Pages, `expense-backup-cron`, Metrics): it runs `loadDataset` and stringify for every owner under the same 10 ms, so it calibrates Node against Cloudflare's meter; Exceeded Resources counts on the production Pages project over 31 days; and whether a bulk import of more than 6 rows or a bulk edit of more than 13 ever succeeded (next section) | Per-route CPU | None; dashboard access |
| (e) A diagnostic route in a throwaway PR preview, to settle `batch()` | The batch question exactly (below), with no rows read or written | Nothing else | One Worker request each; needs a deploy, so needs approval |

### The 50 queries per invocation

The routes were run in process against the SQLite stand-in with a counting wrapper (`routeMatrix.integration.test.ts`
keeps the shape), so these counts are exact for the code and independent of D1. Each real request adds the
middleware's access checks, 5 statements for the owner and 7 for anyone else (the allowlist count and lookup, the group
grant, and the last-seen read, plus one write a day). The harness answers those from a stub, as the route tests do,
so they are not in the table and not billed in the run; they are small reads of the allowlist.

| Request | D1 statements | D1 calls |
|---|---|---|
| `GET /api/expenses` | 19 | 19 |
| `GET /api/expenses`, 304 | 1 | 1 |
| reference / months / cube / series / usage | 20 / 2 / 2 / 3 / 6 | the same |
| list page, summary | 1, 2 | 1, 1 (the summary is a batch of two) |
| `POST /transactions/bulk`, n rows | 6n + 4 | 6n + 4 |
| `PATCH /transactions/bulk`, n rows | 3n + 5 | 3n + 5 |
| `DELETE /transactions/bulk` | 2 | 2 |

**A bulk import of more than 6 rows, or a bulk edit of more than 13, issues more than 50 queries** once the access
checks are added, whichever way a batch is counted, because neither is a batch: they loop (`bulkInsertTransactions`,
and the per-row `deriveOne` in `bulkUpdateTransactions`). If the documented limit applied to this deployment, both
would already fail on the Free plan. If either has ever succeeded in production, the limit does not bind there as the page describes it (or the
account is not on the Free plan), and the 50 can be dropped from the design. That history is the cheapest test and
costs nothing. Whether `batch()` counts as one matters little today: the routes that exceed 50 are not batches. It
matters for the flag fan-out (one statement per row inside one `batch()`) and for any future route.

To settle it directly, a throwaway draft PR adds one route behind the same Access middleware and is closed
unmerged, since every PR already deploys a preview against the development database:

```ts
// functions/api/expenses/batch-probe.ts (temporary; never merged)
export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const mode = new URL(request.url).searchParams.get('mode')
  const statements = Array.from({ length: 60 }, () => env.DB.prepare('SELECT 1'))
  try {
    if (mode === 'batch') await env.DB.batch(statements)
    else for (const statement of statements) await statement.run()
    return Response.json({ mode, result: 'ok' })
  } catch (error) {
    return Response.json({ mode, result: String(error) })
  }
}
```

Open `?mode=batch` and `?mode=separate` signed in as the maintainer, in two requests. A batch that passes beside
separate calls that fail at the 51st means a batch counts as one. Both failing means a batch counts per statement.
Both passing means the limit is not enforced on this deployment. A `SELECT 1` reads and writes no rows.

### Table statistics

SQLite keeps statistics in `sqlite_stat1`, which exists only once `ANALYZE` or `PRAGMA optimize` has run. D1's
[use-indexes page](https://developers.cloudflare.com/d1/best-practices/use-indexes/) [2026-08-10] tells users to run
`PRAGMA optimize` after creating an index, which suggests D1 does not do it unprompted. `check` reads
`SELECT count(*) FROM sqlite_stat1` before the seed; the same read after the seed and again a day later shows
whether D1 ever fills it without being asked (the plan tests hold either way). The run never executes
`PRAGMA optimize` or `ANALYZE`: that would change plans for every owner. The guard refuses it.

### Running it

All commands are `npx tsx scripts/measure-d1.mjs <command>` (`npm run measure:d1 -- <command>`). Reads and the dry
runs come first; each prints what it spends. Do it between 06:00 and 22:00 UTC, not near the 04:00 backup or the
midnight reset, and not while a migration is waiting for the development database (a merge to `main` applies one
there, and an index build writes a row per existing transaction, the synthetic ones included). Seed and measure in the
same budget month: a read in a later month would insert the instalments that have fallen due, and a read-only run
refuses that write.

1. **No cost.** Read the four free facts above. `plan`, `seed` and `cleanup` (dry runs) print the budget and the
   statements without a token.
2. **Read only.** `check --database roy-expenses-dev` reports the target, the last migration, the indexes, whether
   `sqlite_stat1` exists, whether `batch` works through the API, the highest transaction id (which sizes the
   snapshot) and today's account use. `snapshot --database roy-expenses-dev` fingerprints everything that is not the
   synthetic owner's and saves it under `.tmp/scaling/`. Before the first write, note a Time Travel bookmark:
   `npx wrangler d1 time-travel info roy-expenses-dev`.
3. **Day one, 303 transactions.** `seed --database roy-expenses-dev --write --confirm roy-expenses-dev --snapshot <file> --transactions 300`,
   then `measure` (reads), then `measure ... --write --confirm ...` (adds the write routes), then `cleanup ... --write
   --confirm ... --transactions 300` and `verify`.
4. **A later day, 910 transactions.** The same through `measure`, then on a third UTC day `cleanup` and `verify`.
5. `compare <run-a> <run-b>` prints rows read per 1,000 transactions between the two measure runs and the straight-line
   figure at 10,000 and 100,000. Put the figures in this document in place of the estimates, and say which came from
   Cloudflare.

If anything looks wrong, create `.tmp/scaling/stop`; the next statement is refused and the run ends. The run's spend
file (`.tmp/scaling/spend.json`) keeps the totals across commands and days.

### Proving nothing else was touched

- Every write statement binds the synthetic address (the guard), and the transport refuses the rest before sending.
- `snapshot` hashes every row of every owner-scoped table that is not the synthetic owner's, plus the link and
  check-in entry tables, in rowid order. `verify` takes the same hash after cleanup and requires equality, so a row
  changed, added or removed would show as `CHANGED: <table>`. The hashes are of contents that are never printed or
  saved, because the development database can hold a copy of real data. A mismatch is not proof of harm (staging
  is live and someone may have written meanwhile): `owner_revision` and `allowed_users.last_seen_at` change when anyone
  uses the app, so run it in a short window and read the table that differs.
- `verify` also requires every owner-scoped table to hold no row for the synthetic owner and no label link without a
  transaction.
- The rows D1 reported written, summed by the run, are compared with the development database's rows written
  today in the analytics (`d1AnalyticsAdaptiveGroups`, by database id). A large excess means something else wrote.
- Time Travel keeps 7 days of history on the Free plan. A restore discards every write since the bookmark, including
  other people's, so it is the last resort and not part of the plan.
- The same flow runs in `routeMatrix.integration.test.ts` against a database that already holds another owner whose
  ids collide with a fresh seed's, and fails on any change to that owner.

### What stays unmeasured

Whatever is chosen: Worker CPU on Cloudflare's meter for the heavy routes at large ledger sizes (the free evidence
calibrates it at one size, and local workerd gives its shape); anything above 910 transactions, which is a straight
line through two points; D1's latency from a Worker, which a REST call from a laptop does not reproduce; receipts,
settings, scenarios and wealth rows, which the seed leaves out because they are bounded and small. The result of
each item belongs in this document in place of its "not measured" line.

## Status

Built:

- the synthetic ledger generator and the SQLite stand-in for D1, and the measurement above;
- the per-owner revision (migration 0035) and the weak ETag on `GET /api/expenses` built from it, so an unchanged
  ledger is answered with a 304 and no dataset query;
- the windowed Transactions list, which draws only the rows near the screen past 300 rows;
- id lists bound as one JSON string, so bulk edit and delete work on more than 99 rows;
- the audit of how much history each engine reads ([ENGINE-HISTORY.md](./ENGINE-HISTORY.md)), with tests that pin it;
- the keyset list, the capped summary and the by-id read for transactions, with the two indexes they need
  (migration 0036). See "Paged transaction reads". Nothing in the app calls them yet;
- the ledger parts: `GET /api/expenses/reference`, `/transactions/months` and `/cube`, and the receipts of one
  transaction, with a partial index for the pinned rows (migration 0037). See "Ledger parts". Nothing in the app
  calls them yet;
- the ledger model (`src/domain/ledger`, pure code), with differential tests that run the engines over every row and
  over the assembled lists (`src/testing/ledgerDifferential.test.ts`, `ledgerSweep.test.ts`; the result is in
  [ENGINE-HISTORY.md](./ENGINE-HISTORY.md#the-ledger-model));
- an optional classifier or recurring series, built from the whole history, on the four engines that rebuilt their own
  from the rows they were handed (the spending groups, the group detail, the pace envelope and the fixed cost list).
  No screen uses the model or passes one in yet;
- the recurring series route (`GET /api/expenses/series`) with the stored normalized description it groups by, its
  backfill, and tests that hold every consumer to the answer over every row. See "Recurring series". Nothing in the
  app calls it yet;
- description autocomplete over older rows (`GET /api/expenses/descriptions/suggest`) and the merge with the
  browser's own matches. See "Description autocomplete". Nothing in the app calls it yet;
- usage counts per category, account, flag and label (`GET /api/expenses/usage`). See "Usage counts". Nothing in the
  app calls it yet;
- the plan and the tooling for measuring on a deployed system (`scripts/measure-d1.mjs`), which can only write as a
  synthetic owner in the development database and stops at a stated share of the Free plan's daily budget. See
  "Measuring on a deployed system". Tested against the SQLite stand-in; not yet run against Cloudflare;

Not built: the compact read, and the client side of the design. Planned
work, in dependency order:

1. Standalone improvements: a compact read (not built), the revision and ETag (built), list windowing (built).
2. A server query layer: keyset list, summary, by-id and query-plan tests (built); the reference, rows of a range
   and per-month sums (built); series (built).
3. The ledger model and differential tests against the pure engines (built), and the optional classifier or series on
   the four engines (built).
4. The client data layer: hydration, invalidation, snapshot per owner, version skew, and passing the whole history's
   classifier and series to the Overview model and the Spending view, which still build their own.
5. The Transactions tab on server pages, with selection and bulk edit on a filter.
6. The remaining consumers and a resumable backup.
7. Switching the default behind a runtime flag, with the old route kept for stale clients.

## Test tools

- `src/testing/syntheticLedger.ts`: a deterministic dataset of any size, in the shape and order the API returns,
  with fixed, quarterly and yearly series, plan instalments, flagged rows settled by a refund, negative
  investments, cancelled rows and refunds. Placeholder data only.
- `src/testing/inMemoryLedgerParts.ts`: the ledger parts computed with `partitionPinned` and `buildCells` over a whole
  dataset, which the SQL is held to (`dbLedgerParts.parity.test.ts`, over the synthetic, adversarial and random ledgers).
- `src/testing/transactionQueryKit.ts`: the awkward ledger (accents, `%` and `_`, ties on a date, withdrawals, a missing
  account), the stand-in with a record of every statement it ran (for the query-plan tests), and a seeded generator
  of filters, for the paged-read tests.
- `scripts/scaling/` and `functions/_shared/measure/`: the guard, spend ledger, REST transport, seed, cleanup, snapshot
  and route matrix behind `scripts/measure-d1.mjs`. Every piece takes its transport as an argument, so the tests run the
  whole flow over the SQLite stand-in (`sqliteTransport.ts`), including a database that already holds another owner.
- `src/testing/sqliteD1.ts` and `seedSqlite.ts`: the real migrations and a D1-shaped wrapper over node:sqlite, so
  the real SQL runs in tests. It enforces the 100 bound-parameter limit but cannot reproduce D1's billing. They
  live in `src/testing/` because the `functions/` typecheck has no Node types.
