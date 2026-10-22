# API reference

For anyone calling or changing the expense API. Paths are under `/api/expenses`. This page covers the read routes and
the transaction bulk routes, where bounds and costs matter. The other write routes (accounts, categories, flags, labels,
settings and the rest) sit next to their data in [`functions/api/expenses/`](../functions/api/expenses/). How the routes
fit together is in [SCALING.md](./SCALING.md).

## Conventions

- **Owner.** The owner is the Cloudflare Access email of the session, never a request value, and every statement is
  scoped by it. No email is a 401. An email that is not allowed, or lacks the `expenses` group, is a 403.
- **Errors.** The body is `{ "error": "<message>" }`. A request the caller can fix is a 400. That includes an unknown,
  repeated or unreadable query parameter: a misspelt filter that was ignored would answer with every row. Anything
  unexpected is a 500 with a fixed message, and the cause goes to the log.
- **Bounds are refused, never cut.** A request over a bound is a 400 that names the bound, because a client that
  silently received part of a month would add up the wrong total. The bounds are conservative, not derived from a
  deployed Worker: raise one only after measuring CPU on a deployed Worker.
- **Conditional reads.** The dataset, reference, months, cube, series and usage routes send a weak `ETag` and
  `Cache-Control: private, no-cache`. A matching `If-None-Match` gets a 304 after two rows are read, before anything
  else runs. The tag is built from the owner's revision token, which every write request replaces
  ([decision](./decisions/revision-token-and-etag.md)).
- **Tags.** `W/"<token>-<budget month>-<DATASET_FORMAT>"` for the dataset, and `W/"<token>-<budget
  month>-<part><PARTS_FORMAT>[-<from>..<to>]"` for a part, so a tag held for one range never matches another. A change
  to a response's JSON shape moves the format number in [`datasetEtag.ts`](../functions/_shared/datasetEtag.ts).
- **`revision`.** A part's body starts with the token it was read under. Two responses with different `revision`s were
  read from different states of the ledger, so fetch again.

## GET /api/expenses

Every table of the owner in one document, with transaction status derived. Parameters: none. Code:
[`index.ts`](../functions/api/expenses/index.ts).

- Response: the dataset, or a 304 on a tag match. A 200 runs the installment backfill first, which inserts instalments
  that have fallen due on credit-card plans, so a GET can write and move the revision.
- Cost: a 304 reads two rows. A 200 reads every row of every table of the owner, roughly one row per transaction plus
  the small tables.

## GET /reference

The reference tables, the pinned rows and what the ledger holds. Parameters: none. Code:
[`reference.ts`](../functions/api/expenses/reference.ts).

- Response: `revision`; `reference` (every dataset table except transactions and receipts); `pinned` (rows that stay
  real at any age: investments, rows with a plan, flag or settlement, the rows another row was settled by, and payments
  with a covered count); `attachmentCounts` (`{ transactionId: receipts }` for pinned rows that have any); `months`
  (every budget month with a row, cancelled rows included, oldest first); `rowsPerMonth`; `rowCount`.
- Bounds: none. Tag part: `reference`.
- When the tag misses it runs the installment backfill and reads the revision again, so a backfill that inserted rows is
  already in the tag and in `revision`.
- Cost: the reference tables, one row per pinned row (through `idx_txn_pinned`), and one index entry per transaction for
  the month counts, since a count is billed as a scan.

## GET /transactions/months

Every real row whose budget month is in a range, newest first. Code:
[`months.ts`](../functions/api/expenses/transactions/months.ts).

- Parameters: `from` and `to`, budget months as `YYYY-MM`, both required and inclusive.
- Response: `{ revision, from, to, transactions, attachmentCounts }`. Rows are as the dataset carries them, with
  `labelIds` ascending.
- Bounds: 24 months and 5,000 rows (`MAX_ROWS_MONTHS`, `MAX_ROWS_PER_REQUEST` in
  [`ledgerParts.ts`](../src/domain/data/ledgerParts.ts)). A month with more than 5,000 rows can only be read through the
  list with a `month` filter.
- Errors: 400 for a missing, malformed, reversed or too wide range, or a range over a bound.
- Tag part: `months` plus the range. It runs no backfill, so in a new budget month a due instalment is missing here
  until the reference has been read.
- Cost: at most 5,001 index entries plus the rows returned, so a range that is too big costs the bound and not the
  range.

## GET /cube

The per-month sums of the unpinned rows in a range. A cell is one (budget month, account, category, type, cancelled,
sign) with the summed cents and a row count; a month of only cancelled rows, or a sum of zero, still has its cell, and
pinned rows are in no cell. Code: [`cube.ts`](../functions/api/expenses/cube.ts).

- Parameters, errors and tag as for months, with part `cube`. Bounds: 120 months and 10,000 cells. Response: `{
  revision, from, to, cells }`. No backfill.
- Cost: an index entry and a row for every row in the range. The cube saves Worker CPU and bytes, not D1 reads.

## GET /attachments

The receipts of one transaction, oldest first, or of every transaction the caller has when none is named. Code:
[`attachments/index.ts`](../functions/api/expenses/attachments/index.ts).

- Parameters: `transactionId`, optional. Without it the answer is every receipt the caller has, by transaction and then
  id, which is what the dataset route carries and what a screen that needs them all asks for (the storage meter). A
  non-positive or non-integer id is a 400. A transaction that is not the caller's has no receipts as far as the caller
  can tell.
- Not conditional. Cost: the receipt rows asked for. Without a `transactionId` that is every receipt the owner has,
  which the owner's storage quota bounds (2 GB by default, roughly 10,000 receipts).

## GET /transactions/list

Keyset pages of the owner's transactions. Code: [`list.ts`](../functions/api/expenses/transactions/list.ts).

- Parameters: the filter, one parameter per field of `TxnFilter` (`month`, `dateFrom`, `dateTo`, `categoryId`,
  `accountId`, `type`, `status`, `flagId` as an id or `none`, `labelIds` comma separated with at most 100 and any one
  matching, `query`, `amountMinCents`, `amountMaxCents`, and `queryAmountFromCents` with `queryAmountToCents`), `limit`
  (1 to 200, default 50) and `cursor`.
- Response: `{ items, nextCursor }` in `date DESC, id DESC` order. `nextCursor` is null on the last page. Rows are as
  the dataset carries them. Statement-payment rows are synthesized by the client and are not served.
- Paging is by position. A cursor is the last row of a page and a digest of the filter, as base64url JSON, and the next
  page is the rows strictly after it, so a row inserted or deleted between two fetches never repeats or hides one that
  was there throughout. A changed filter or an edited cursor is a 400. The digest is not a signature and carries no
  owner.
- Differences from the engine's filter: search uses `instr`, so `%` and `_` are plain characters and D1's 50-byte `LIKE`
  cap does not apply. Search text is at most 200 characters and holds at most 8 different non-ASCII letters, because
  SQLite lowers only ASCII and each such letter's capital has to be folded by hand (`CAFÉ` matches `café`). Letters
  whose capital is not one character that lower-cases back (`ß`, final sigma, the Kelvin sign, `İ`) are not folded. A
  row whose account is missing counts as posted even when cancelled.
- Not conditional, and never cached: `Cache-Control: private, no-store`. Cost: the rows returned plus any the filter
  rules out on the way; it stops at the limit.

## GET /transactions/summary

Count and net spend for a filter. Code: [`summary.ts`](../functions/api/expenses/transactions/summary.ts).

- Parameters: the list's filter. `limit` and `cursor` are a 400.
- Response: `{ revision, count, capped, netSpendCents }`. `revision` is the owner's token read before the count, and a
  bulk edit on this filter names it as `expectedRevision`. `count` stops at 1,000 and `capped` says there were more.
  `netSpendCents` is exact over every match.
- Never cached: `Cache-Control: private, no-store`.
- Cost: the token is two rows. The count reads at most 1,001 matches. The exact net spend reads every row the filter
  cannot rule out by index, so an unfiltered summary reads the whole ledger (about one dataset load) and a month or date
  range reads only that range.

## GET /transactions/:id

One transaction as the dataset carries it. Code: [`[id].ts`](../functions/api/expenses/transactions/%5Bid%5D.ts). A row
that is not the caller's is the same 404 as a missing one. A non-positive or non-numeric id is a 400. Cost: one row.

## GET /series

Every recurring series of the owner over the whole history, newest first. Code:
[`series.ts`](../functions/api/expenses/series.ts).

- A series is three or more rows that share a normalized description, account, category and type, leaving out cancelled
  rows, blank descriptions and instalment-plan payments. Parameters: none.
- Response: `{ revision, series }`. A series carries the newest row's label, amount, account, category and type; its
  newest 5 dates; the gaps in days between every older pair, ascending; every distinct budget month; and the budget
  offsets of its newest 3 rows. That is all the recurring detectors read. Rows logged after `revision` are not in it.
- Errors: 503 with `Retry-After: 1` while rows still wait for their `description_norm` (the first requests after
  migration 0038). Each retry gets further.
- Tag part: `series`. No backfill, since a plan's payments are not part of a series.
- Cost: every counted transaction is read on each tag miss, and every write is a miss. D1 billed about ten rows read
  per transaction when measured (3,027 rows for 303 transactions). An unchanged ledger is a 304 at two rows, so fetch it
  when a screen needs it, not after every write.

## GET /descriptions/suggest

Descriptions that start with what was typed, among rows booked before a month. Code:
[`suggest.ts`](../functions/api/expenses/descriptions/suggest.ts).

- Parameters: `q` (1 to 140 characters once trimmed, normalized as the browser's index does); `before` (optional budget
  month, only rows booked in earlier budget months count, so a client sends its oldest held month and the two sides are
  every row with none in both; a date is a 400); `limit` (1 to 25, default 8, decimal digits only); `locale` (a language
  tag that letters sort by, so send the browser's own; absent, the Worker's own is used; a tag the server has no rules
  for is a 400).
- Response: `{ items, tooBroad }`. Each item is a description as its newest row speaks for it: `label`, `template`
  (`type`, `categoryId`, `accountId`), `date` and `id`. Cancelled and blank rows are out. Order is the browser index's
  `key` order. `mergeDescriptionMatches` joins this answer to the client's own matches, and the result equals the index
  over every row when the client holds every row booked from `before` on, sends its locale, and its ICU sorts text as
  the Worker's does.
- A prefix that matches more than 500 different descriptions of the owner, whatever their status or month, is a 200 with
  `tooBroad: true` and no items. It is an ordinary answer for a letter or two of typing: keep the local matches and ask
  again when more is typed.
- Errors: 400 for any other parameter; 503 with `Retry-After: 1` while `description_norm` is being filled.
- Caching: `Cache-Control: private, no-store`, since a request is one prefix and the answer follows every write.
- Cost: one index seek per matching description and one more for its newest eligible row, so a few rows per description
  plus that description's rows inside the client's window. It does not walk every row that starts with the prefix. The
  Worker sorts at most 500 strings, and a `tooBroad` answer builds no collator and sorts nothing.

## GET /usage

How many records name each category, account, flag and label. Settings shows the counts and asks for a reassignment
before a delete. Code: [`usage.ts`](../functions/api/expenses/usage.ts).

- Response: `{ revision, categories: [{ id, transactions, plans }], accounts: [{ id, transactions, plans, statements }],
  flags: [{ id, transactions }], labels: [{ id, transactions }] }`. Every record is listed with zeros, ascending by id.
  Transactions count at any status, cancelled rows and instalment payments included, and once per label.
- A category or account with all counts zero deletes outright. One with any count is refused with a 409 unless the
  request names a `reassignToId`. Deleting a flag or a label clears its links instead.
- Tag part: `usage`. It runs the installment backfill on a miss, because a plan's payments are transactions that name a
  category and an account.
- Cost: one pass over the owner's transactions. D1 billed about two rows read per transaction plus about two per label
  link when measured.

## GET /export

One chunk of one table of the owner's ledger as NDJSON, for the CSV export and the backup. Code:
[`export.ts`](../functions/api/expenses/export.ts).

- Parameters: `table` (one of `EXPORT_TABLES`, listed in restore order in
  [`exportTables.ts`](../src/domain/data/exportTables.ts)), `after` (the position to start from, absent for the first
  chunk) and `limit` (1 to the table's bound, default the bound). A position is the id, a month for `cashActuals` or
  `accountId:month` for `accountStatements`, and carries no owner. `settings` has one row and no position.
- Response: one JSON row per line, in primary-key order, as the dataset carries it (a transaction with its derived
  status and ascending label ids, a check-in with its entries, an attachment as metadata only). Headers:
  `X-Export-Table`, `X-Export-Format`, `X-Export-Revision` and, while the table has more rows, `X-Export-Next`, which is
  the next `after`. Follow it until it is absent, for every table, to read the ledger.
- Bounds: 5,000 rows for transactions and attachments, 500 for check-ins, 1 for settings and 1,000 for the rest. A
  larger `limit` is a 400, never trimmed. An unknown table or a position that is not one of that table's is a 400.
- Caching: `Cache-Control: private, no-store`. A walk is not a snapshot. `X-Export-Revision` is the token read before
  the rows, so a reader that needs one consistent state compares it across chunks and starts again when it moved.
- It writes nothing and does not run the installment backfill, so an instalment that has fallen due and not yet been
  created is not in an export. Cost: the chunk's rows plus one, read in primary-key order with no sort.

## Bulk transaction routes

`POST`, `PATCH` and `DELETE /transactions/bulk` are in [`bulk.ts`](../functions/api/expenses/transactions/bulk.ts) and
`POST /transactions/bulk/labels` in [`bulk/labels.ts`](../functions/api/expenses/transactions/bulk/labels.ts). The
single-row `POST /transactions` and `PATCH` and `DELETE /transactions/:id` sit beside them.

- **`POST /transactions/bulk`** with `{ transactions: [...] }` answers 201 with `{ created, transactions }`. The whole
  batch is validated before anything is written and a bad row is a 400 that names it ("Row 7: ..."). Rows are inserted
  one at a time, because a plan-linked row reads the installment index of the row before it.
- **`PATCH /transactions/bulk`** takes rows by id or by filter. `patch` may hold `categoryId`, `accountId`, `type`,
  `date`, `budgetMonth`, `flagId`, `settledBy` and `description`, and at least one.
  - By id, `{ ids, patch }` answers `{ updated, transactions }`. A reimbursement that would settle a row already settled
    by another is a 409.
  - By filter, `{ filter, expectedCount, expectedRevision, patch }` answers `{ updated }`, with no rows sent back. The
    filter is a `TxnFilter` as JSON, validated as the list's is. `expectedCount` and `expectedRevision` are the `count`
    and `revision` that `GET /transactions/summary` gave for that filter. Both the count and the matches are at most
    1,000 (`MAX_FILTER_EDIT_ROWS`, the summary's count cap), and more is a 400, never cut.
  - A filter edit is a 400 for an invalid body, filter or patch, a patch that names another owner's account, category,
    flag or payment, and a type change that would leave a withdrawal on an expense. It is a 409 if anything was written
    to the ledger since that revision (an edit in another tab counts), if the filter now matches another number of rows,
    if a row is settled by another payment, or if a row changed between the check and the write. The batch starts with a
    guard that fails unless exactly the ids that were read still match, so nothing is written when the ledger moved. A
    refused request still moves the revision, as every write request does, so look again before retrying.
- **`POST /transactions/bulk/labels`** adds labels and keeps the labels rows already have (the single-row `PUT` replaces
  the set). Rows are given by `{ ids, labelIds }` or by `{ filter, expectedCount, expectedRevision, labelIds }`, with
  the filter refusals above. It answers `{ matched, added }`: the owner's rows reached (an id that is another owner's,
  or missing, is not counted) and the label links that were new. A label that is not the owner's is a 400. A request
  names at most 20 labels and adds at most 5,000 links (rows times labels), because each new link writes a row in the
  table and in three indexes against the daily written-row budget.
- **`DELETE /transactions/bulk`** with `{ ids }` answers `{ deleted, requested }`. The receipt files go first, then the
  rows, their receipt rows and label links in one batch, and `settled_by` is cleared on any row a deleted payment had
  settled. There is no filter form ([decision](./decisions/no-filter-based-delete.md)).
- `ids` holds at most 500 positive integers (duplicates are dropped), bound as one JSON string because D1 allows 100
  bound values per statement.

**Cost in D1 statements**, counted on a real D1 through the real middleware, with its access checks stubbed (about five
more for the owner, an estimate): a create is 6n + 4 for n rows (124 for 20), an edit by id is 3n + 5 (155 for 50; each
updated row is read back and its status derived with three queries), and a delete is 6 for 1 row and for 20. The SQLite
stand-in counts one more for each of these (6n + 5, 3n + 6 and 7). Only the stand-in has counted the edit by filter and
the labels route, at 7 and 6 however many rows. Cloudflare documents a limit of 50 queries per invocation on the Free
plan, which was not enforced when probed ([SCALING.md](./SCALING.md#observed-on-a-free-account)). What the counts mean
for a large request if it is, and how to check again, is in
[MEASURING.md](./MEASURING.md#the-50-queries-per-invocation).
