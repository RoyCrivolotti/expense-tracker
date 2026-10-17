# Scaling

How the app behaves as the number of transactions grows, what that costs today, and the direction the data
layer is moving in. Every number below can be reproduced; the command is next to it.

## How data reaches the browser today

`GET /api/expenses` runs `loadDataset` (`functions/_shared/db.ts`) and returns every table for the owner in one
document. The browser keeps all of it in memory, runs every engine in `src/domain/engine/` over the full
`Transaction[]`, clones the whole dataset on each mutation (`datasetPatches.ts`) and writes it to IndexedDB. The
daily backup calls `loadDataset` too.

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
   50k and 18 at 250k.
5. The transaction list is not virtualized (`SwipeTransactionRow.tsx`), so the All scope renders every row, and the
   backup runs the same load for every owner in one invocation, so it meets the same CPU limit.

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
key. Every response carries a per-owner revision, and a weak ETag on it lets most opens end after a one-row read.

## Status

Built: the synthetic ledger generator, the SQLite stand-in for D1, the measurement above, and the ledger model
(`src/domain/ledger`, pure code) with differential tests that run the engines over every row and over the assembled
lists (`src/testing/ledgerDifferential.test.ts`, `ledgerSweep.test.ts`; the result is in
[ENGINE-HISTORY.md](./ENGINE-HISTORY.md#the-ledger-model)). No screen uses the model yet, so nothing under
"Proposed design" changes what the app does. Planned work, in dependency order:

1. Standalone improvements: a compact read, the revision and ETag, list windowing.
2. A server query layer: keyset list, summary, by-id, per-month sums, series, with query-plan tests.
3. Passing the classifier or series into the four engines that build their own, so the differences listed in
   ENGINE-HISTORY.md go away.
4. The client data layer: hydration, invalidation, snapshot per owner, version skew.
5. The Transactions tab on server pages, with selection and bulk edit on a filter.
6. The remaining consumers and a resumable backup.
7. Switching the default behind a runtime flag, with the old route kept for stale clients.

## Test tools

- `src/testing/syntheticLedger.ts`: a deterministic dataset of any size, in the shape and order the API returns,
  with fixed, quarterly and yearly series, plan instalments, flagged rows settled by a refund, negative
  investments, cancelled rows and refunds. Placeholder data only.
- `src/testing/sqliteD1.ts` and `seedSqlite.ts`: the real migrations and a D1-shaped wrapper over node:sqlite, so
  the real SQL runs in tests. It enforces the 100 bound-parameter limit but cannot reproduce D1's billing. They
  live in `src/testing/` because the `functions/` typecheck has no Node types.
