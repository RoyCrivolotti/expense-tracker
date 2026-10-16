# Scaling — what breaks as the ledger grows, and the plan

`GET /api/expenses` returns every table for the owner in one document (`loadDataset`,
`functions/_shared/db.ts`). The browser keeps all of it in memory, runs every engine over the full
`Transaction[]`, clones the whole dataset on each mutation (`datasetPatches.ts`) and writes it to IndexedDB.
The daily backup calls the same `loadDataset`. This page records what that costs, measured, and the plan to
stop paying it.

## Constraints

- Cloudflare **Free** plan. Documented limits that matter (Cloudflare docs: Workers limits, D1 limits and
  pricing; re-check before relying on them): 10 ms CPU per request (Pages Functions bill as Workers), 50 D1
  queries per invocation, 5M rows read and 100k rows written per day, 100 bound parameters per statement,
  500 MB per database. `rows_read` counts rows scanned, not returned, and `COUNT(*)` is a scan. Each index adds
  a written row per insert.
- Offline is read-only (recent months and settings). No offline writes and no sync.
- Same screens, same numbers. The pure functions in `src/domain/engine/` are the reference.

## Measured: the current path, by ledger size

`SCALING_MEASURE=1 npx vitest run functions/_shared/loadDataset.scaling.test.ts` seeds a synthetic ledger
(`src/testing/syntheticLedger.ts`, 120 months) into an in-memory SQLite with the real migrations, then runs the
real `loadDataset`. Node 22 on an Apple M5 Pro. **These are desktop numbers with an in-memory database.**
`server JS` is the load minus time inside SQLite: a stand-in for Worker CPU, not a measurement of it. A phone
is roughly 4 to 8 times slower on the client columns.

| Rows | Server JS | + stringify | Compact read* | JSON | gzip | parse | clone | rows read per load |
|---|---|---|---|---|---|---|---|---|
| 4.9k | 5.1 ms | 1.0 | 0.7 ms | 1.1 MB | 0.1 MB | 1.6 ms | 3.3 ms | 5.7k |
| 9.9k | 13.9 ms | 1.9 | 1.5 ms | 2.3 MB | 0.2 MB | 3.0 ms | 7.6 ms | 11.3k |
| 19.9k | 20.8 ms | 3.9 | 3.1 ms | 4.6 MB | 0.3 MB | 6.1 ms | 15.7 ms | 22.5k |
| 49.9k | 58 ms | 11.7 | 7.4 ms | 11.4 MB | 0.8 MB | 18 ms | 40 ms | 56k |
| 99.9k | 109 ms | 21 | 15 ms | 22.8 MB | 1.5 MB | 34 ms | 83 ms | 112k |
| 249.9k | 326 ms | 58 | 47 ms | 57 MB | 3.5 MB | 99 ms | 223 ms | 280k |

\* Raw column tuples straight to JSON, no row mapping and no status derivation on the server (the client would
derive status from accounts and statements). `clone` is what every mutation pays today.

What it says:

1. **Worker CPU is the first wall: roughly 7,500 to 9,000 transactions on Free.** Mapping and deriving status
   costs about 1.1 ms per 1,000 rows and stringify another 0.2, so the 10 ms limit is crossed near 7,500 rows
   (9,000 without stringify). That is an estimate from Node, not a workerd reading. If the real ledger were
   already past it, loads would be failing, so either the real row count is below it or workerd's meter differs
   from this proxy; staging settles which.
2. A compact read moves that wall to about 65,000 rows (about 9 times). It is cheap to build and stands alone.
3. **The network is not the problem**: gzip is 1.5 MB at 100k rows. Parse and clone are tens of milliseconds on
   a desktop up to 100k rows, but a phone pays 4 to 8 times that on every mutation.
4. **D1 rows read**: every load reads every row, so the daily 5M budget covers about 440 loads at 10k rows, 90
   at 50k and 18 at 250k.
5. The transaction list is not virtualized (`SwipeTransactionRow.tsx`), so "All" scope renders every row. The
   backup runs the same load for every owner in one invocation, so it hits the same CPU wall.

## Checked on a deployed D1

Read-only queries against the dev database through the D1 query API:

- **The 100 bound-parameter limit is real.** A query with 100 bound parameters runs; 101 fails with
  `too many SQL variables` (SQLITE_ERROR, code 7500). The code binds `owner` plus every selected id as separate
  parameters for bulk delete and bulk edit (`dbWrite.ts`) and for attachments (`dbAttachments.ts`), so a bulk
  action on more than 99 rows is expected to fail today. node:sqlite allows 32,766 variables, so the unit
  tests cannot see it. This went through the query API, which uses the same engine as the Worker binding; the
  app's own bulk route sits behind Cloudflare Access and was not exercised.
- **One bound JSON string is a working fix.** `id IN (SELECT value FROM json_each(?))` accepted 5,000 ids. The
  list itself is read as rows (501 rows read for 500 ids).
- **`COUNT(*)` is billed as a scan**: counting a table reports every row as read.
- The owner's real ledger, checked read-only on production, is far below the CPU wall above. This is a question
  of growth, and of what a bulk import of old history would do, not a present failure.

Still needs a deployed run: workerd CPU, whether `batch()` counts as one query toward the 50, and rows written
per index.

## Design in one page

A **ledger** is: reference data (always local), **pinned rows** (always real: investments and rows tied to a
plan, flag or settlement), **hydrated months** (real rows for the months being viewed, the viewed month back
13), and a **cube** of per-month sums for everything else, which only the engines that are linear in amounts
receive. Status stays derived on the client. When the ledger is small, every month is hydrated and the cube is
empty, which is today's model, so there is one code path and two policies.

| Feature | Runs |
|---|---|
| Month totals, budgets, yearly, cash reconciliation and close, statement amounts, goals flows, cash reserve, baseline, KPI totals | Browser, real rows plus cube |
| Day-cut KPIs, movers, spending groups and detail, pace, top transactions | Browser, hydrated `[M-13, M]` |
| Recurring and Upcoming, fixed vs flexible, fixed costs, allocation | Endpoint returns the series; the detector finishes in the browser |
| Portfolio return, gap split, installments, Flagged, reports, reimbursement links | Browser, pinned rows |
| Transaction list, count, net spend, search | Endpoint: keyset pages and a capped summary |
| Autocomplete beyond loaded rows, usage counts, detail by id, bulk on a filter (edit only), export, backup | Endpoint |

Requests are split (reference, months, cube, list, summary, series) so each has its own CPU budget and cache
key. Every response carries a per-owner `revision`; a weak ETag on it lets most opens end after a one-row
read.

## Stages

0. Measure and decide (this page, the synthetic ledger, the SQLite D1 stand-in). No behavior change.
1. Standalone wins: the bulk-parameter fix (confirmed above, and the one a user can hit today), `revision` and
   ETag, compact read, list virtualization.
2. Server query layer: keyset list, summary, by-id, cube, series, repository contract suite, query-plan tests.
3. Ledger model: pinned rows, typed cube cells, differential tests against the pure engines.
4. Client data layer: hydration, invalidation, cascade refetch, snapshot per owner, version skew.
5. Transactions tab on pages: infinite list, server summary, selection and bulk rework.
6. Remaining consumers and a resumable backup.
7. Flip behind a runtime flag, soak with shadow reads. The old route stays, capped by size.

## Tools added for this work

- `src/testing/syntheticLedger.ts`: a deterministic dataset of any size in the shape and order the API returns,
  with fixed, quarterly and yearly series, plan instalments, flagged rows settled by a refund, negative
  investments, cancelled rows and refunds. Placeholder data only.
- `src/testing/sqliteD1.ts` and `seedSqlite.ts`: the real migrations and a D1-shaped wrapper over node:sqlite,
  so the real SQL runs in tests. It cannot reproduce D1 billing or limits. They live in `src/testing/` because
  the `functions/` typecheck has no Node types.
