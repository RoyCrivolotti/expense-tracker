# Scaling

For an engineer deciding how the data layer should grow: how data reaches the browser, the limits it has to stay inside,
what was measured and how to repeat it, and the design for ledgers too large to load whole. Per-route facts are in
[API.md](./API.md), and the choices behind the design are in [decisions/](./decisions/).

## How data reaches the browser

`GET /api/expenses` runs `loadDataset` ([`db.ts`](../functions/_shared/db.ts)) and returns every table of the owner in
one document. The UI loads it once (`useExpenseData`), keeps all of it in memory and runs every engine in
`src/domain/engine/` over the full `Transaction[]`. It clones the dataset on each local mutation
([`datasetPatches.ts`](../src/ui/datasetPatches.ts)) and keeps a snapshot in IndexedDB for offline reading
([`offlineCache.ts`](../src/data/offlineCache.ts)). The daily backup calls `loadDataset` for every owner as well.

A browser that already holds the current version gets a 304 after two rows are read, before any dataset query. The ETag
is built from a per-owner revision that every write replaces ([decision](./decisions/revision-token-and-etag.md)).

The same data can be read in parts instead: the reference tables with the pinned rows, the real rows of a range of
months, and per-month sums ([API.md](./API.md)). The data source offers both ways, and `loadLedger`
([`ledgerLoader.ts`](../src/data/ledgerLoader.ts)) assembles the parts into a `Ledger`. Each part carries the revision
it was read under, so a write that lands between two reads is noticed, the reference is read again, and after three
attempts the load fails. Two states of the ledger are never mixed.

## Constraints

The app is built to run on the Cloudflare **Free** plan. These are the documented limits that shape the design.
Cloudflare changes limits, so re-check the Workers and D1 limits and pricing pages before relying on a figure.

| Limit | Free plan |
| --- | --- |
| Worker CPU per request (Pages Functions bill as Workers) | 10 ms |
| D1 queries per Worker invocation | 50 |
| Bound parameters per D1 statement | 100 |
| D1 database size | 500 MB |
| Rows read per day | 5 million. Rows scanned count, not rows returned, so a `COUNT(*)` is a scan |
| Rows written per day | 100,000. Every index adds one written row per insert |

D1 is stricter than the SQLite the tests run on, in ways a test on SQLite cannot show. It refuses more than 100 bound
parameters, which is why id lists are bound as one JSON string read with `json_each`
([`sqlIdList.ts`](../functions/_shared/sqlIdList.ts)), and it refuses a compound `SELECT` of more than five terms. The
test stand-in enforces the first rule and not the second. Cloudflare's documentation does not say whether each statement
of a `batch()` counts toward the 50, and that has not been measured.

Two constraints come from the product. Output must not change: the pure functions in `src/domain/engine/` are the
reference for every number. Offline is read-only (a snapshot, no offline writes, no sync).

## What was measured

```bash
SCALING_ROWS=5000,10000,20000,50000,100000,250000 SCALING_MEASURE=1 \
  npx vitest run functions/_shared/loadDataset.scaling.test.ts --reporter=verbose
```

This seeds a synthetic ledger ([`syntheticLedger.ts`](../src/testing/syntheticLedger.ts), 120 months) into an in-memory
SQLite database with the real migrations and runs the real `loadDataset`. The figures below came from Node 22 on an
Apple Silicon laptop, so they are desktop numbers against an in-memory database. "Server JS" is the load minus the time
spent inside SQLite, a stand-in for Worker CPU and not a measurement of it. The sizes, gzip and rows read are exact and
repeat. The timings do not: a rerun on the same laptop gave about 1.5 ms of JavaScript per 1,000 rows against the 1.1
below. Other `*.scaling.test.ts` files measure one route each in the same way.

| Rows | Server JS | + stringify | JSON | gzip | parse | clone | rows read per load |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 4.9k | 5.1 ms | 1.0 ms | 1.1 MB | 0.1 MB | 1.6 ms | 3.3 ms | 5.7k |
| 9.9k | 13.9 ms | 1.9 ms | 2.3 MB | 0.2 MB | 3.0 ms | 7.6 ms | 11.3k |
| 19.9k | 20.8 ms | 3.9 ms | 4.6 MB | 0.3 MB | 6.1 ms | 15.7 ms | 22.5k |
| 49.9k | 58 ms | 11.7 ms | 11.4 MB | 0.8 MB | 18 ms | 40 ms | 56k |
| 99.9k | 109 ms | 21 ms | 22.8 MB | 1.5 MB | 34 ms | 83 ms | 112k |
| 249.9k | 326 ms | 58 ms | 57 MB | 3.5 MB | 99 ms | 223 ms | 280k |

"clone" is what every local mutation pays today.

1. **Worker CPU is the first limit, at a few thousand to about ten thousand transactions.** Mapping rows and deriving
   status costs 1.1 to 1.5 ms per 1,000 rows and stringifying another 0.2, so 10 ms is crossed between roughly 6,500 and
   9,000 rows. This is an estimate from Node. workerd's meter differs, so confirm it on a deployed Worker before relying
   on it.
2. **The network is not the constraint.** The response is 1.5 MB gzipped at 100,000 rows. Parse and clone are tens of
   milliseconds on a desktop, but a phone is several times slower and pays for the clone on every mutation.
3. **D1 rows read.** Every load reads every row, so the daily 5 million covers about 440 loads at 10,000 transactions,
   90 at 50,000 and 18 at 250,000. A 304 skips the load, so the figure counts opens that follow a change.
4. **The single-file backup would meet the same limit**, since it runs the same load for every owner in one invocation.
5. **A load issues 16 D1 queries**, inside the limit of 50.

Not measured: Worker CPU on workerd, rows billed per route on a deployed D1, and how the 50-query limit counts a
`batch()`. [MEASURING.md](./MEASURING.md) says how to measure the rows billed and the `batch()` count safely.

## The design

A **ledger** is the part of the data a client holds when it does not hold every transaction
([decision](./decisions/ledger-model.md)):

1. **Reference data**, always held in full: categories, accounts, flags, labels, statements, cash actuals, settings,
   plans, scenarios, wealth accounts and check-ins. It is bounded and small.
2. **Pinned rows**, real at any age: every investment, and rows tied to a plan, a flag or a settlement. They feed
   portfolio return, instalments, flagged groups and reports, which read exact dates, signs and links.
3. **Hydrated months**, real rows for the 13 newest months with data up to the month on screen. Engines are relative to
   the viewed month, so the window follows it and does not end today.
4. **Per-month sums** for every other month: one cell per (budget month, account, category, type, cancelled, sign) with
   the summed cents and a row count. Only engines that are linear in amounts receive them. Status is still derived in
   the browser, from the account and its statements.
5. **Server answers** for questions that depend on unbounded history.

A ledger of 5,000 rows or fewer hydrates every month and has no sums, which is today's behavior, so there is one code
path with two sizing policies. Which engines can be given less history without changing their output, and which cannot,
is in [ENGINE-HISTORY.md](./ENGINE-HISTORY.md).

| Feature | Runs |
| --- | --- |
| Month totals, budgets, yearly overview, cash reconciliation and close, statement amounts, goals flows, cash reserve, spending baseline, KPI totals | Browser, from real rows plus sums |
| Same-days KPIs, movers, spending groups and detail, pace, top transactions | Browser, from hydrated months |
| Recurring and Upcoming, fixed versus flexible, fixed costs, allocation | The series come from `GET /series`, and the detector finishes in the browser |
| Portfolio return, gap split, instalments, flagged groups, reports, reimbursement links | Browser, from pinned rows |
| Transaction list, count, net spend, search | Server: keyset pages and a capped summary |
| Autocomplete beyond loaded rows, usage counts, one row by id | Server |

Requests are split (reference, months, sums, list, summary, series, description matches, usage counts) so each has its
own CPU budget and cache key. The reference, months, sums, series and usage routes are checked against the owner's
revision, so most opens end after a two-row read. The series route reads the whole ledger whenever its tag misses, and
every write makes it miss, so a client should fetch it when a screen needs it and not after every write.

### Indexes

Each index adds one written row per insert, or none for a partial index when the row is not in it. These are the ones
the design depends on, each held by a query-plan test that fails on a full scan of `transactions`:

| Index | Migration | Serves |
| --- | --- | --- |
| `idx_txn_owner_date (owner, date)` | 0036 | Newest-first pages and date ranges, with no sort |
| `idx_txn_owner_month_date (owner, budget_month, date)` | 0036 | A month, a range of months, and the per-month row counts |
| `idx_txn_pinned (owner, date)`, partial on the pinned rule | 0037 | The pinned rows, already in date order. Only a pinned row pays the written row |
| `idx_txn_owner_desc_norm (owner, description_norm, date)` | 0038 | Grouping and prefix search by normalized description, and the newest row of a description |

The cube has no index of its own: a covering one would be eleven columns wide and add a written row to every insert on a
table that already has twelve indexes. Two older indexes are not needed any more. `idx_txn_budget_month` is read by no
statement the repository issues, and `idx_txn_owner` is the first column of `idx_txn_owner_date`, so with both dropped
every statement is planned over the same tables (`transactionIndexUsage.test.ts`). Dropping them would save two written
rows per insert. It is a migration for a later change, since the deploy applies every file in `migrations/` on merge.

## Where else to look

- [API.md](./API.md) for every route's parameters, bounds, caching and cost in rows.
- [decisions/](./decisions/) for why the ledger model, the stored normalized description, the revision token and the
  id-only delete are as they are.
- [ARCHITECTURE.md](./ARCHITECTURE.md) for the rules the code has to keep obeying, such as which writes move the
  revision.
- [TESTING.md](./TESTING.md) for the synthetic ledger, the SQLite stand-in for D1 and the query-plan tests.
