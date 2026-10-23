# Scale proof

For an engineer deciding whether to lift the 5,000-row limit of ledger mode: what opening the app costs with the
whole dataset (classic) and with the ledger read in parts, from 1,000 to 100,000 transactions. Everything here ran on
one laptop and made no call to Cloudflare, so it costs nothing to repeat. How the two modes work is in
[LEDGER-MODE.md](./LEDGER-MODE.md), and the platform limits and the deployed-D1 figures are in
[SCALING.md](./SCALING.md).

## What the figures are

Each table says which kind a column is. **Measured** was counted or timed directly. A **proxy** stands in for
something only the real platform can report. An **estimate** is a proxy scaled by a ratio taken at 910 rows.

| Figure | Kind | Stands in for |
| --- | --- | --- |
| Requests, statements, bytes, DOM nodes, heap, long tasks, times in the browser | Measured | |
| Rows visited | Proxy | D1's rows read, which is what the Free plan bills |
| Node time of a handler, less time inside SQLite ("JS ms") | Proxy | Worker CPU, which workerd meters differently |
| Rows read on D1 | Estimate | Rows visited times the ratio below |

The ratio of the rows the dev database reported at 910 rows ([SCALING.md](./SCALING.md#on-a-deployed-d1)) to the rows
visited for the same requests here: dataset 1.04, reference 1.00, months 0.76, list 0.85, summary 0.69, sums 1.51,
series 1.39. Statement counts matched D1's exactly (19, 20, 2, 2, 3 and 6 for the routes compared). So rows visited
is within about a third of D1's figure for most routes and 40 to 50 percent under it for the sums and the series. Read
the estimates as an order of magnitude. The finding is the growth with size and the ratio between the two modes.

## How it was run

- **Data.** The repo's synthetic ledger ([`syntheticLedger.ts`](../src/testing/syntheticLedger.ts)), placeholders only,
  at about 40 rows a month up to 120 months and then more rows a month. The tables use the nominal sizes; the ledgers
  hold 990 rows over 25 months, 4,938 over 120, and 9,978, 24,978, 49,938 and 99,978 over 120. One owner, the repo's
  migrations, no `sqlite_stat1`. Node 22, Chromium from Playwright 1.61, on an Apple Silicon laptop.
- **Server.** The real route handlers through the real middleware, over a SQLite file. Rows visited are SQLite's own
  scan statistics (`sqlite3_stmt_scanstatus`), summed over every node of the plan, sorters included. The client side of
  the open is the app's own `chooseLedger`, `LedgerSession` and `TransactionPager`, replayed against those handlers.
- **Browser.** A production build of the app, with the two guards that keep window mode out (`refuseWindow` in
  `LedgerExpensesApp` and the row limit in `chooseLedger`) rewritten as the build reads them. Nothing in `src/` changes
  and the default build is untouched. Classic is the same build with `?ledger=off`; ledger mode is `?ledger=on`, which
  is the shipped behaviour up to 5,000 rows and window mode above it.
- **Chromium** (Playwright) with a fresh profile per run, against a local server that gzips as the edge does. "Laptop" is
  a 1280 px window with the CPU throttled 4 times and "phone" a 390 px touch window throttled 6 times, a rough stand-in
  for a mid-range phone. Medians of 3 runs (2 at 100,000). There is no network latency, so a request that waits for
  another costs nothing here and would cost a round trip on a real network.
- **Usable** means the Dashboard shows its figures, a click on Analytics shows the Overview with its figures (without the
  note that says the history is still being read), and a click on Transactions shows the net spend and the first day of
  rows. The Dashboard is timed from navigation, the others from the click.

The scripts that drove the runs are not in the repository; the handlers, the synthetic ledger and the route matrix they
used are.

Not measured: Worker CPU, D1's own time, any network, a real phone, the cost of a write on the classic path (every
local change clones the whole dataset, see [SCALING.md](./SCALING.md#what-was-measured)), and ledgers with more than 120
months.

## Step 1: what opening costs at 1,000 and 5,000 rows

Ledger mode as shipped. "Open" is the Dashboard; "with tab" adds the Transactions tab's first page and its count.

| | 1,000 classic | 1,000 ledger | 5,000 classic | 5,000 ledger | Kind |
| --- | --- | --- | --- | --- | --- |
| Requests, open / with tab | 1 / 1 | 3 / 5 | 1 / 1 | 6 / 8 | Measured |
| D1 statements, open / with tab | 17 / 17 | 22 / 26 | 17 / 17 | 28 / 32 | Measured |
| Rows visited, open / with tab | 2.3k / 2.3k | 7.4k / 7.7k | 11.1k / 11.1k | 36.6k / 36.9k | Proxy |
| Rows read on D1, with tab | 2.4k | 6.1k | 12k | 30k | Estimate |
| JSON, raw (gzip) | 237 KB (19) | 260 KB (23) | 1.1 MB (91) | 1.2 MB (99) | Measured |
| Open again, nothing changed: requests / statements / rows | 1 / 1 / 1 | 5 / 7 / 252 | 1 / 1 / 1 | 8 / 10 / 285 | Measured |
| Dashboard usable, 4x / 6x | 229 / 351 ms | 549 / 678 ms | 287 / 407 ms | 605 / 736 ms | Measured |
| Longest block of the main thread, 4x / 6x | 55 / 90 ms | 55 / 84 ms | 88 / 133 ms | 87 / 131 ms | Measured |
| JS heap kept, laptop | 5 MB | 5 MB | 5 MB | 6 MB | Measured |

At these sizes ledger mode holds every row, so the screen is the same and it costs more. It reads about 3 times the
rows (about 2.5 times by the estimate), and makes 3 to 8 requests where classic makes one, the months only after the
reference. The second open is a 304 for the reference and the months (1 statement each), but the list and the count
are read again (the 252 and 285 rows). Nothing in the browser improves: the heap and the longest block are the same,
and the Dashboard takes about twice as long. A rows request covers at most 24 months, so 25 months take two requests
at 1,000 rows and 120 months take five at 5,000.

## Step 2: big ledgers

### Server, per request

Each cell is rows visited, Node JS ms and raw payload. Months is the 13 months of the window, as the app asks for it
(two requests at 50,000 and three at 100,000, summed, because a request holds at most 5,000 rows). Sums is every older
month in one request.

| Request | 10,000 | 25,000 | 50,000 | 100,000 |
| --- | --- | --- | --- | --- |
| Classic `GET /api/expenses` | 22k, 12.9 ms, 2.3 MB | 56k, 32.7 ms, 5.7 MB | 111k, 69 ms, 11.4 MB | 222k, 131 ms, 22.9 MB |
| `reference` | 11k, 0.9 ms, 95 KB | 27k, 1.2 ms, 135 KB | 52k, 1.5 ms, 190 KB | 104k, 2.3 ms, 315 KB |
| `months`, 13 months | 6.8k, 1.5 ms, 254 KB | 16.9k, 3.5 ms, 632 KB | 34k, 7.3 ms, 1.2 MB | 67k, 13.7 ms, 2.5 MB |
| `cube`, older months | 17.6k, 1.8 ms, 512 KB | 44k, 2.6 ms, 674 KB | 88k, 2.8 ms, 781 KB | 177k, 3.3 ms, 930 KB |
| `series` | 69.6k, 1.7 ms, 201 KB | 174k, 3.1 ms, 363 KB | 347k, 5.3 ms, 568 KB | 695k, 10.0 ms, 817 KB |
| `list`, first page of a month | 0.3k, 0.2 ms, 20 KB | 0.3k, 0.3 ms, 23 KB | 0.3k, 0.3 ms, 23 KB | 0.3k, 0.3 ms, 23 KB |
| `summary`, one month | 0.3k, 0.1 ms | 0.6k, 0.1 ms | 1.3k, 0.1 ms | 2.5k, 0.1 ms |
| `summary`, all dates | 12k, 0.2 ms | 27k, 0.1 ms | 52k, 0.2 ms | 102k, 0.4 ms |

Rows visited and JS ms are proxies and the payload is measured. How far JS ms is from Worker CPU is not known.
Against the documented 10 ms, the classic read passes it between 5,000 rows (5.8 ms) and 10,000 (12.9 ms), and
no windowed request passes it except the series at 100,000 (10.0 ms). The probe in SCALING.md saw no enforcement of the
limit on one account.

The query plans were the same at every size, and none of them reads `transactions` without an index. The only full
table scans are `categories` and `accounts`, which have no index on the owner and read every owner's rows, so they grow
with the number of users and not with a ledger.

| Query | Plan | Reads |
| --- | --- | --- |
| `list` | `idx_txn_owner_date`, from the cursor, then the account and statement by key | One page |
| `summary`, count | covering `idx_txn_owner`, inside `LIMIT 1001` | Stops at 1,001 rows |
| `summary`, net spend | `idx_txn_owner` for all dates, `idx_txn_owner_month_date` for a month | Every row in the scope |
| `months` | covering `idx_txn_owner_month_date` on the range, a key lookup per row, a sorter | The rows in the range |
| `cube` (sums) | `idx_txn_owner_month_date` on the range, the settled rows from `idx_txn_settled_by`, a sorter for the group | The rows in the range |
| `series` | `idx_txn_owner_desc_norm` over the owner, then five sorters for the windows, the group and the order | Every row, about 7 visits each |
| `reference` | covering `idx_txn_owner_month_date` for the count per month, `idx_txn_pinned` for the pinned rows | Every row, once |

Note, 2026-10-23: the `months` row above and its figures in the table before are as measured for this proof. PR #482
then changed the read: it takes the rows straight off the month index, with no join to the account and statement per row
and no sorter in SQL, and the Worker orders the rows and works out each status. The same 13-month window visited 670,
3,332 and 13,207 rows at 1,000, 25,000 and 100,000 rows, against 3,236, 16,903 and 67,387 here, which is 3 to 5 times
fewer (the lower end if D1 does not bill the sorter and the extra pass the old plan made).

So five requests read the whole ledger whatever the window: the classic read, the reference, the series, the usage
counts and the net spend over all dates. The list, the months and the sums are bounded by their range.

### Server, one cold open

A cold open is one that reads everything: the first on a device, or the first after any write, since every write moves
the revision and a browser that holds the old one gets a 200. "Window mode" reads the reference, the 13 months, the
sums, the series (when the Overview mounts) and the Transactions tab's first page. Rows visited are split into open,
series and tab. The slowest request is the one with the most JS ms.

| Rows | Mode | Requests | Statements | Rows visited | Rows on D1 | JSON, raw (gzip) | Slowest request | Open again |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10,000 | Classic | 1 | 17 | 22k | 23k | 2.3 MB (171 KB) | 12.9 ms | 1 / 1 / 1 |
| 10,000 | Window | 6 | 29 | 36k + 70k + 0.5k | 140k | 1.1 MB (95 KB) | 1.8 ms | 6 / 8 / 539 |
| 25,000 | Classic | 1 | 17 | 56k | 58k | 5.7 MB (412 KB) | 32.7 ms | 1 / 1 / 1 |
| 25,000 | Window | 6 | 29 | 88k + 174k + 1k | 350k | 1.8 MB (158 KB) | 3.5 ms | 6 / 8 / 962 |
| 50,000 | Classic | 1 | 17 | 111k | 120k | 11.4 MB (781 KB) | 69 ms | 1 / 1 / 1 |
| 50,000 | Window | 7 | 31 | 175k + 347k + 1.6k | 700k | 2.8 MB (223 KB) | 6.1 ms | 7 / 9 / 1,599 |
| 100,000 | Classic | 1 | 17 | 222k | 230k | 22.9 MB (1.5 MB) | 131 ms | 1 / 1 / 1 |
| 100,000 | Window | 8 | 33 | 349k + 695k + 2.8k | 1.4M | 4.5 MB (323 KB) | 10.0 ms | 8 / 10 / 2,839 |

Kinds: requests, statements and bytes are measured, rows visited and the slowest request are proxies, rows on D1 is an
estimate. "Open again" is requests, statements and rows when nothing changed.

Window mode makes the payload 2 to 5 times smaller (more as the ledger grows) and every request short, and reads 4.7
times the rows at every size (about 6 times by the estimate). Two thirds of the rows are the series, a sixth the sums
and a sixth the reference and the window. Against the Free plan's 5 million rows a day, one cold open at 100,000 rows
would be about 28 percent of the day by the estimate, against about 5 percent for classic. A shipped ledger over 5,000
rows is worse than classic by the reference it reads before it hands back: 1.5 times the rows (27k, then the whole
dataset, at 25,000).

### Browser

Time is Dashboard / Overview / Transactions in milliseconds. Block is the longest single block of the main thread. All
measured. Heap is what stays after a garbage collection with the Transactions tab open, on the laptop profile. The DOM
stays near 430 nodes on the Dashboard in both modes. On the Transactions tab it follows the rows of the month until a
list passes 300 rows, and then draws only the rows near the screen (600 to 4,100 nodes in these runs).

| Rows | Mode | Laptop 4x time | Block | Phone 6x time | Block | Heap | JSON gzip |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 10,000 | Classic | 322 / 396 / 136 | 158 | 467 / 433 / 249 | 235 | 7 MB | 171 KB |
| 10,000 | Window | 598 / 475 / 113 | 55 | 738 / 535 / 198 | 87 | 7 MB | 96 KB |
| 25,000 | Classic | 480 / 507 / 243 | 366 | 661 / 749 / 431 | 550 | 10 MB | 413 KB |
| 25,000 | Window | 623 / 550 / 107 | 61 | 769 / 611 / 195 | 92 | 7 MB | 159 KB |
| 50,000 | Classic | 742 / 853 / 327 | 698 | 989 / 1,235 / 513 | 1,042 | 14 MB | 781 KB |
| 50,000 | Window | 672 / 633 / 110 | 95 | 825 / 703 / 194 | 143 | 8 MB | 223 KB |
| 100,000 | Classic | 1,392 / 1,432 / 544 | 1,286 | 1,600 / 2,178 / 836 | 1,974 | 23 MB | 1.5 MB |
| 100,000 | Window | 768 / 855 / 116 | 162 | 929 / 933 / 214 | 240 | 9.5 MB | 324 KB |

With no throttle (one run each), classic at 100,000 rows takes 634 ms to the Dashboard with a block of 316 ms, and
window mode 516 ms with none over 50 ms. At 25,000 the unthrottled classic block is 87 ms, and window mode has none.

### iPhone Simulator, 25,000 rows

An iPhone 17 on iOS 27 in Safari, on this Mac's CPU with no throttle, so it is the floor of what a phone does and not a
phone. Marks are sent from the page. Safari offers no heap or long-task reading. Two runs each, the first of classic
also warming the server (740 ms to the Dashboard).

| Mode | Dashboard | Overview | Transactions | Stalls over 50 ms |
| --- | --- | --- | --- | --- |
| Classic | 245 ms | 317 to 347 ms | 97 to 98 ms | 2 to 4, the longest 99 ms |
| Window | 432 to 460 ms | 461 to 462 ms | 44 to 68 ms | None |

## What this says

- **When classic stops being fine.** Taking a main-thread block over 200 ms as the line, which is where input starts
  to lag: on the laptop profile classic is fine to 10,000 rows (158 ms), over at 25,000 (366 ms) and unusable at 100,000
  (1.3 s). On the phone profile it is fine to 5,000 (133 ms), just over at 10,000 (235 ms), clearly over at 25,000
  (550 ms) and at 100,000 blocks for 2 s. Time to usable is not the first thing to go: it stays under a second to 25,000
  on both profiles, the Overview passes a second at 50,000 on the phone profile, and everything does at 100,000. The
  server side meets the documented 10 ms of Worker CPU between 5,000 and 10,000 rows, if it is enforced.
- **Does window mode fix it.** In the browser, yes. At 100,000 rows the longest block is 162 ms on the laptop profile
  and 240 ms on the phone profile, and the heap is 9.5 MB against 23 MB. It does not make opening faster below about
  50,000 rows: the reference, then the months and the sums, wait on each other, so the Dashboard takes 110 to 330 ms
  longer than classic up to 25,000 rows. The crossover is between 25,000 and 50,000. On the server it makes the worst
  case worse: about 6 times the rows read on a cold open at every size from 10,000, mostly the series, which scans
  the whole ledger, and the sums, which grow with the number of older months and rows. Each request is short (about
  10 ms of JS at most), so it fits the Worker limit that classic does not.
- **Ledger mode against classic at 1,000 and 5,000 rows.** About 3 times the rows visited and 3 to 8 requests for 1,
  with nothing gained: the heap, the longest block and the screen are the same, and the Dashboard takes about twice as
  long on localhost, more on a network with latency. Up to the limit it is overhead that buys no headroom.

## What it means for lifting the limit

Lifting it would move the cost from the browser to the database. The browser stops stalling, but the rows read, which
D1 bills and the Free plan caps, grow about 6 times on every cold open: by the estimate 350k rows at 25,000 (7 percent
of a day's 5 million), 700k at 50,000 and 1.4M at 100,000. Two thirds of that is the series and a sixth the sums, and
the reference reads every row once to count the months in both modes. Reading less in those three is what would let
window mode win on the server as well. A local run cannot confirm the series, the sums and the reference on a deployed
database at 10,000 rows or more, or Worker CPU.
