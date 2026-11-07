# Scaling

For an engineer deciding how the data layer should grow: how data reaches the browser, the limits it has to stay inside,
what was measured and how to repeat it, and the design for ledgers too large to load whole. Per-route facts are in
[API.md](./API.md), and the choices behind the design are in [decisions/](./decisions/).

## How data reaches the browser

`GET /api/expenses` runs `loadDataset` ([`db.ts`](../functions/_shared/db.ts)) and returns every table of the owner in
one document. The UI loads it once (`useExpenseData`), keeps all of it in memory and runs every engine in
`src/domain/engine/` over the full `Transaction[]`. It clones the dataset on each local mutation
([`datasetPatches.ts`](../src/ui/datasetPatches.ts)) and keeps a snapshot in IndexedDB for offline reading
([`offlineCache.ts`](../src/data/offlineCache.ts)). The daily backup calls `loadDataset` for every owner as well. That is the path of a browser that turned ledger mode off
(`?ledger=off`); the default reads the ledger in parts ([LEDGER-MODE.md](./LEDGER-MODE.md)).

A browser that already holds the current version gets a 304 after two rows are read, before any dataset query. The ETag
is built from a per-owner revision that every write replaces ([decision](./decisions/revision-token-and-etag.md)).

The same data can be read in parts instead: the reference tables with the pinned rows, the real rows of a range of
months, and per-month sums ([API.md](./API.md)). The data source offers both ways, and `loadLedger`
([`ledgerLoader.ts`](../src/data/ledgerLoader.ts)) assembles the parts into a `Ledger`. Each part carries the revision
it was read under, so a write that lands between two reads is noticed, the reference is read again, and after three
attempts the load fails. Two states of the ledger are never mixed.

## Constraints

The design stays inside the Cloudflare **Free** plan's limits, so a fork on the Free plan works. The maintainer's
deployment runs on Workers Paid, where the daily D1 limits do not apply. These are the documented limits that shape the
design, read on 2026-11-01. Cloudflare changes limits, so re-check the pages named in the last column before relying on
a figure.

| Limit | Free plan | Workers Paid | Cloudflare page |
| --- | --- | --- | --- |
| Worker CPU per request (Pages Functions bill as Workers) | 10 ms | 30 s by default, up to 5 min. 30 million CPU ms a month included, then $0.02 per million | [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) |
| Requests | 100,000 a day | No daily limit. 10 million a month included, then $0.30 per million | Workers limits, Workers pricing |
| Subrequests per invocation (D1, R2 and `fetch` calls) | 50 | 10,000 | Workers limits |
| D1 queries per Worker invocation | 50 | 1,000. A `batch()` counts as one | [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) |
| Bound parameters per D1 statement | 100 | 100 | D1 limits |
| D1 database size | 500 MB | 10 GB | D1 limits |
| D1 Time Travel history | 7 days | 30 days | D1 limits |
| Rows read | 5 million a day. Rows scanned count, not rows returned, so a `COUNT(*)` is a scan | 25 billion a month included, then $0.001 per million | [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) |
| Rows written | 100,000 a day. Every index adds one written row per insert | 50 million a month included, then $1.00 per million | D1 pricing |

Above a limit the plans differ. On Free, D1 refuses queries once a daily limit is reached. On Paid there is no hard cap:
use above the included allowance is billed at the rates above. D1 counts the same rows either way, so a figure below in
rows read or written holds on both plans.

D1 is stricter than the SQLite the tests run on, in ways a test on SQLite cannot show. It refuses more than 100 bound
parameters, which is why id lists are bound as one JSON string read with `json_each`
([`sqlIdList.ts`](../functions/_shared/sqlIdList.ts)), and it refuses a compound `SELECT` of more than five terms. The
test stand-in enforces the first rule and not the second. Cloudflare's D1 limits page says a `batch()` counts as one
query toward the per-invocation limit.

### Observed on a Free account

The design stays inside the documented limits, so it holds on any plan and in any fork, and would hold if enforcement
changed. A probe on 2026-10-22 did not see the 50 queries or the 10 ms enforced on one Free-plan account. A throwaway
route on a deployed preview of this app (never merged) ran 60 `SELECT 1` as separate D1 calls in one request, and the
same 60 in one `batch()`. All succeeded, with no failure at the 51st. It also ran about 10 million and about 100 million
loop iterations in a request. Both completed, and the larger used about 275 ms of CPU by the platform's own analytics.
This is one account on one day: an observation that may change, not a guarantee. The recipe to repeat it is in
[MEASURING.md](./MEASURING.md#the-50-queries-per-invocation). That account has since moved to Workers Paid (confirmed
on 2026-11-01), where the limits are 1,000 queries and 30 s of CPU, so the same probe there would no longer test the Free
plan's limits.

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

1. **Worker CPU against the Free plan's documented 10 ms.** Mapping rows and deriving status costs 1.1 to 1.5 ms per
   1,000 rows and stringifying another 0.2, so a full load passes 10 ms between roughly 6,500 and 9,000 rows if the
   limit is enforced. This is an estimate from Node, and workerd's meter differs. The probe above saw no enforcement, so
   a load of that size is not known to fail, and the design still keeps the CPU of one request small. Workers Paid
   defaults to 30 s.
2. **The network is not the constraint.** The response is 1.5 MB gzipped at 100,000 rows. Parse and clone are tens of
   milliseconds on a desktop, but a phone is several times slower and pays for the clone on every mutation.
3. **D1 rows read.** Every load reads every row. D1 billed about 2.3 rows read per transaction for it (2,189 at 910
   transactions, against about 1.1 in the stand-in's column above), so the Free plan's daily 5 million covers about 200
   loads at 10,000 transactions, 40 at 50,000 and 9 at 250,000, if the slope holds. A 304 skips the load, so the figure
   counts opens that follow a change. On Workers Paid a load at 250,000 transactions reads about 575,000 rows, which
   costs $0.0006 at the rate above once the monthly allowance is used up.
4. **The single-file backup would meet the same limit**, since it runs the same load for every owner in one invocation.
5. **A load issues 19 D1 queries** on a deployed D1 (the table below), inside the limit of 50.

### On a deployed D1

`scripts/measure-d1.mjs` ran the route handlers against a development D1 database through Cloudflare's REST API, which
reports the rows each statement read and wrote ([MEASURING.md](./MEASURING.md)). The ledger was synthetic: one reserved
example owner with 303 transactions on one day and 910 on another, removed afterwards. Rows read are the rows a
statement visited, which is what D1 bills. Statements count each member of a `batch()`. The harness stubs the
middleware's access checks, about five statements a request, so they are in none of the counts. The statements column is
for the current handlers; the bulk routes that grow with the rows have their formulas in
[API.md](./API.md#bulk-transaction-routes).

| Route | Statements | Rows read at 303 | Rows read at 910 | Per 1,000 more | Rows written |
| --- | --- | --- | --- | --- | --- |
| `GET /api/expenses` | 19 | 774 | 2,189 | about 2,330 | 0 |
| `GET /api/expenses`, unchanged (304) | 1 | 1 | 1 | none | 0 |
| `GET /reference` | 20 | 546 | 1,224 | | 0 |
| `GET /transactions/months`, 3 months | 2 | 863 | 549 | | 0 |
| `GET /cube`, 12 months | 2 | 890 | 1,415 | | 0 |
| `GET /series` | 3 | 3,027 | 8,848 | about 9,590 | 0 |
| `GET /descriptions/suggest`, one letter | 2 | 139 | 159 | | 0 |
| `GET /usage` | 6 | 756 | 2,122 | about 2,250 | 0 |
| `GET /transactions/list`, first page | 1 | 277 | 137 | | 0 |
| `GET /transactions/list`, second page | 1 | 283 | 133 | | 0 |
| `GET /transactions/list`, one month | 1 | 208 | 109 | | 0 |
| `GET /transactions/summary` | 3 | 608 | 1,823 | | 0 |
| `GET /transactions/summary`, one month | 3 | 78 | 83 | | 0 |
| `GET /transactions/recent`, default 8 | 1 | | 21 | | 0 |
| `GET /transactions/recent`, limit 50 | 1 | | 132 | | 0 |
| `GET /export`, transactions, first 500 | 2 | | 1,343 | | 0 |
| `GET /export`, transactions, next chunk (410 rows) | 2 | | 1,142 | | 0 |
| `GET /transactions/:id` | 1 | 5 | 3 | none | 0 |
| `POST /transactions`, one row | 9 | 10 | 12 | | 11 |
| `POST /transactions/bulk`, 20 rows | 125 | 164 | 185 | | 182 |
| `PATCH /transactions/bulk`, 50 ids (category) | 6 | 628 | 639 | | 102 |
| `DELETE /transactions/bulk`, 20 rows | 7 | 264 | 265 | | 22 |
| `DELETE /transactions/:id` | 7 | 6 | 7 | | 3 |

Only the dataset, the series and the usage ran the same SQL on both days, so only they have a slope. The SQL of the list
pages, the summary, the months and the reference changed in between (the label join, a summary read as a batch), and the
edit by ids now reads its rows back in one query, so their 303 figures are not comparable with the 910 ones. A list page
is bounded by its page. The cube and the 3-month window stop growing once the ledger spans more months than the window,
which the 303 ledger did not (8 months against 23). A 304 and one row by id do not grow.

D1's own time at 910 transactions was 15 to 17 ms for the dataset, 9 to 10 for the series, 32 for the 20-row create over
its 125 statements and under 8 for every other route. It is the database's clock, not Worker CPU.

The recent and export routes were added to the run later and measured once, on the 910 ledger. Each read about 2.6 to
2.8 rows for every row it returned, which is the account, statement and label reads of
[Rows visited](./API.md#conventions) and not the one row per row that a local count suggested: 21 rows for the default 8,
132 for 50, and 1,342 and 1,141 for the two export chunks (a second statement reads the revision token and rollover day
in one row). D1's own time was under 1 ms for 8 recent rows, 5 for 50, 9 for a 500-row chunk and 5 for the 410 that
followed. Both are bounded by `limit`, so they should not grow with the ledger, but that was seen locally at 600 and
1,200 rows and not on D1 at a second size.

An ordinary expense wrote 8 rows when inserted with an explicit id and 9 through the API: the row, seven indexes and,
for an insert without an id, the sequence row of its `AUTOINCREMENT` key. That last part fits the counts and was
inferred, not observed. A label link writes 4. Every write request adds 2 for the revision bump, so a single create is
11. Changing a row's category writes 2 for it. A delete wrote 1 per row removed on both days (cleaning up the 910
transactions, 74 label links, 76 reference rows and the revision row wrote 1,061), so D1 did not appear to bill the
index entries it removed.

The large reads:

- **The series** is one statement that reads 8,847 of the 8,848 rows: a `row_number()` and a `lag()` over two orderings
  of every counted transaction, about 9.7 rows per transaction.
- **The dataset** reads 911 rows in the scan of the transactions and 1,132 in the labels join, which finds 74 links
  because it walks the owner's transactions.
- **The usage** counts are one `GROUP BY` scan over the transactions (2,101 of its 2,122 rows).
- **The summary** reads 911 rows for its count, which stops growing at 1,001, and another 911 for its net sum, which
  does not.

Not measured: Worker CPU (the REST API reports none, and the probe above ran a loop), latency from a Worker, whether
Cloudflare counts a `batch()` as one query toward the 50, as its D1 limits page says (the probe saw no limit to count
against), the rows read and written of most routes above 910 transactions (the next section has D1's time for a few),
and the access-check statements, which the harness stubs. [MEASURING.md](./MEASURING.md) says how to repeat the run with
a larger seed.

### D1's own time at 10,000 and 25,000 rows

Measured on 2026-11-01 on a throwaway D1 database with synthetic placeholder rows. Each figure is the median of three
runs of D1's own `meta.duration`, the time the database spent on the statements. It leaves out the Worker, the network
and the access checks, so it is neither request latency nor Worker CPU.

| Read | 10,000 rows | 10,000 rows, from the rollup | 25,000 rows | 25,000 rows, from the rollup |
| --- | --- | --- | --- | --- |
| Row counts per month | 1.4 ms | 0.3 ms | 3.2 ms | 0.3 ms |
| Cube of the older months | 31 ms | 14 ms (4.6k rows read) | 78 ms (61k rows read) | 24 ms (7.4k rows read) |
| Series | 71 ms | | 175 ms (242k rows read) | |
| 13-month window | 22 ms | | 51 ms | |
| Net spend over all dates | 1.7 ms | | 5.3 ms | |
| Every transaction row | 91 ms | | 189 ms | |

"From the rollup" is the same answer read from `ledger_cells` and `ledger_months` ([below](#rollup-tables)), which no
route does yet. The synthetic ledger has more cells per row than a typical real one, so the rollup saves more on real
data. From 10,000 to 25,000 rows the reads from the rows grew by 2.1 to 3.1 times, against 2.5 times the rows, and the
reads from the rollup by 1.0 to 1.7 times.

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

A ledger of 10,000 rows or fewer hydrates every month and has no sums, which is the whole-dataset behavior, so there is one code
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

### Rollup tables

`ledger_cells` and `ledger_months` (0039) are kept by triggers, so an insert writes two more rows, a delete two more (three
when it empties its cell, four when its month empties too), an edit that moves a row to another cell two more (three when
the old cell empties), and an edit of an amount alone one more. No route reads them yet. D1 counts the rows they write
toward the plan's limit, and bills them on Workers Paid above the included allowance; the measured costs are in
[the decision](./decisions/ledger-rollup.md).

## Where else to look

- [API.md](./API.md) for every route's parameters, bounds, caching and cost in rows.
- [decisions/](./decisions/) for why the ledger model, the stored normalized description, the revision token and the
  id-only delete are as they are.
- [ARCHITECTURE.md](./ARCHITECTURE.md) for the rules the code has to keep obeying, such as which writes move the
  revision.
- [TESTING.md](./TESTING.md) for the synthetic ledger, the SQLite stand-in for D1 and the query-plan tests.
