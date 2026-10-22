# Architecture

For a contributor changing the code: the layers, and the rules the code has to keep obeying, each with its reason. The
app is ports-and-adapters (hexagonal): the domain layer knows nothing about D1, HTTP or React, and the UI and Functions
are both adapters around it.

## Layers

| Layer | Location | Depends on | Knows about |
| --- | --- | --- | --- |
| **Engine** (pure compute) | `src/domain/engine/` | Nothing | Money formatting, dates, budget totals, cash reconciliation, transaction status, goals math |
| **Ports** (interfaces) | `src/domain/ports/` | Domain types only | `ExpenseRepository`, `AccessRepository`, `AuthProvider`, `BackupStore`, `EmailSender`: shapes the UI and Functions code against, never a vendor SDK |
| **Application** (use cases) | `src/domain/application/` | Ports, engine | Orchestration that needs more than one repository call (`installmentPlanService`, `transactionService`, `transactionQueryService`, `ledgerPartsService`, `goalService`, `categoryService`) |
| **Data** (parsing) | `src/domain/data/` | Domain types | CSV import and export parsing, transaction ID helpers: pure, no I/O |
| **Ledger** (pure model) | `src/domain/ledger/` | Domain types, engine | Splitting a dataset into reference data, pinned rows, hydrated months and per-month sums, and assembling the row lists the engines take |
| **Adapters, backend** | `functions/_shared/adapters/` | Ports | `d1ExpenseRepository`, `d1AccessRepository`, `r2BackupStore`, `cloudflareEmailSender`, `cloudflareAccessAuth` |
| **Adapters, frontend** | `src/data/`, `src/testing/` | Ports | `apiDataSource` (HTTP client), `csvDataSource`, `inMemoryExpenseRepository` (test double) |
| **Driving side, API** | `functions/api/` | Application, ports | Cloudflare Pages Functions HTTP handlers ([API.md](./API.md)) |
| **Driving side, UI** | `src/ui/` | Application, engine, data | React components; no direct D1 or HTTP, always through `src/data/` |

`src/engine/`, `src/types.ts` and similar top-level re-export barrels exist only so older imports keep working. The real
implementation is always in `src/domain/`, so import from there in new code. Functions reach `src/domain` and `config/`
through the symlinks `functions/domain` and `functions/config`, because Cloudflare's Pages Functions bundler ignores
Wrangler `alias`. `npm run verify` recreates them (`scripts/ensure-function-symlinks.mjs`), while the Vite app uses the
`@domain/*` and `@config/*` aliases.

## Rules

### Data and tenancy

- **Transaction status is derived, never stored.** `src/domain/engine/status.ts` computes posted, forecast or cancelled
  from the account's settlement and whether its statement for the budget month is paid. A stored status would go stale
  when a statement is toggled, so if you want one, fix the derivation.
- **Every table is keyed by `owner`, and every query filters by it.** The owner is the authenticated email from the
  session, never a request value, a filter or a cursor. A query without an `owner` predicate is a cross-tenant leak. New
  tables and queries follow `functions/_shared/adapters/d1ExpenseRepository.ts`.
- **Currency and number format are display-only.** Amounts are stored as locale-neutral integer cents and never
  converted (`src/domain/engine/money.ts`).
- **The in-memory repository mirrors the D1 adapter.** `src/testing/inMemoryExpenseRepository.ts` is a full test double,
  not a stub. Validation, cascade or unlink behavior added to the D1 adapter is added there too, or tests pass against
  the double while the real backend rejects or corrupts the same input.
- **A referenced category or account is deleted only by reassigning its rows.** One used by a transaction, an instalment
  plan or (for an account) a statement needs a `reassignToId` or an inline create payload, and an unused one deletes
  outright. The reassign and the delete run as one `env.DB.batch(...)`, so a failure cannot leave rows pointing at a
  deleted id. An inline create runs first as its own statement, because D1 cannot use one statement's new id in a later
  statement of the same batch, and it is cleaned up on a best-effort basis if the batch then fails (`deleteCategory` and
  `deleteAccount` in `dbConfig.ts`). Archiving (`active: false`) is unrelated and never blocked.
- **Pickers and reassign targets offer only active categories and accounts**, so nothing new is linked to something
  archived. The one exception is a form's own current value, so editing an unrelated field never breaks the form
  (`src/ui/components/pickerOptions.ts`).
- **Real emails, figures and identifiers never reach a tracked file.** The source is public. Commit a placeholder
  (`owner@example.com`) with a comment telling whoever applies the change to substitute the real value, and keep real
  per-deployment config gitignored beside a committed `*.example.json`. `scripts/check-pii.mjs` fails `npm run verify`
  on a tracked email outside an allowlist of exact addresses.

### Dataset revision

- **Every write moves the owner's revision, so a matching ETag means nothing changed.** A write that does not move it
  leaves browsers on stale data until the owner's next write. The paths that change the dataset's tables are:
  - `functions/api/_middleware.ts`, which replaces it before and after every request that is not a GET, HEAD or OPTIONS.
    The second replacement also runs when the handler throws or answers an error, since the write may have landed, and
    is retried once.
  - `backfillInstallments`, when it inserted rows. It writes during a GET (the dataset, reference and usage routes), and
    the backup reaches it through `loadDataset`.
  - `purgeOwnerData`, which deletes the row, and anything else that writes those tables outside the API (a seed script,
    SQL by hand, a data migration), which deletes or replaces it, as the generators in `scripts/` do.
  - The one write that does not move it is filling `transactions.description_norm`, because the column is derived from
    `description` and is in no response.
- **A new write route needs nothing, and a new GET route must not write the dataset's tables** apart from those two.
  `datasetRevision.integration.test.ts` derives the write routes from the route files and fails for one with no test
  case.
- **The tag is read before the data it describes.** A write in between leaves the tag older than the data, which costs
  one reload. The other order could pair a new tag with old data and serve it until the next write.
- **A change to a response's JSON raises its format constant**, `DATASET_FORMAT` or `PARTS_FORMAT` in
  `functions/_shared/datasetEtag.ts`, or browsers keep the old shape under a tag that still matches.
  `datasetEtag.test.ts` and `ledgerPartsEtag.test.ts` fail when a shape moves without it. The reasons for the design are
  in [the decision record](./decisions/revision-token-and-etag.md).

### Reads that run in SQL

Each of these has a pure reference, and a parity test holds the SQL to it.

- **Paged transaction reads run the engine's filter in SQL.** `filterTransactions` in
  `src/domain/engine/transactions.ts` is the specification, `transactionQuerySql.ts` is the only place a `TxnFilter`
  becomes SQL, and `dbTransactionQuery.parity.test.ts` compares the pages with the engine over random filters and
  awkward rows. A new filter field needs five things: the engine, its SQL clause, the generator in
  `src/testing/transactionQueryKit.ts`, a validator in `transactionQueryService.ts` and its name in
  `transactionQueryParams.ts`.
- **Every value in SQL is bound, and the number bound per statement is fixed by the statement's shape.** D1 allows 100.
  A list of ids travels as one JSON string read with `json_each` (`functions/_shared/sqlIdList.ts`).
- **No statement that reads a ledger may scan `transactions` or read another owner's rows.** The query-plan tests
  (`*Plans.test.ts`) run each statement through `EXPLAIN QUERY PLAN`, with and without table statistics and among
  several owners, because the planner chooses differently in each. The usage statement groups by `category_id + 0` so
  that the planner cannot pick `idx_txn_category`, which has no owner and would read every owner's rows.
- **The ledger parts are specified by the ledger model.** `src/domain/ledger/partsOfDataset.ts` computes them from a
  whole dataset with `partitionPinned` and `buildCells`, and `dbLedgerParts.parity.test.ts` holds `ledgerPartsSql.ts` to
  that. The pinned rule is written four times: `isPinned`, `PINNED_SQL`, `UNPINNED_SQL` and the predicate of
  `idx_txn_pinned` (migration 0037), which SQLite reads only when a statement has the same terms. Changing it means
  changing all four and adding a migration, because a deployed index cannot be edited. Ranges are capped by constants in
  `src/domain/data/ledgerParts.ts` and refused beyond them, never cut.
- **The recurring series are specified by the engine.** `seriesFromTransactions` in
  `src/domain/engine/recurringSeries.ts` reduces what `groupTransactions` builds to what the detectors read,
  `seriesSql.ts` is the only place a series becomes SQL, and `dbSeries.parity.test.ts` and
  `seriesConsumers.parity.test.ts` hold the SQL and every consumer to it. A change to what a detector reads of a series
  means changing `RecurringSeries`, the SQL and `PARTS_FORMAT` together.
- **`transactions.description_norm` is the app's normalized description, and every statement that writes a description
  writes it.** SQL that grouped or searched on `lower(trim(description))` would disagree with `normalizeDesc` for "CAFÉ"
  or a tab, so anything that groups or searches by description in SQL uses the column. NULL means "not computed yet": a
  read that groups by it first calls `ensureDescriptionNorm`, which fills a bounded chunk and answers 503 until none are
  waiting. `descriptionNormWrites.test.ts` fails for an INSERT or UPDATE that writes a description without it, in
  `functions/`, `scripts/` or a later migration ([decision](./decisions/stored-normalized-description.md)).
- **Description autocomplete has one order, shared by the browser and the server.**
  `src/domain/engine/descriptionSearch.ts` holds the collator order and the prefix range, and both
  `buildDescriptionIndex` and `dbDescriptionSuggest.ts` use it. A description's place in the order must never depend on
  which of its rows is newest, or `mergeDescriptionMatches` stops being exact, which is why the index's `key` order
  reads the normalized text and not the label. `dbDescriptionSuggest.parity.test.ts` holds the SQL and the merge to the
  index over every row.
- **Usage counts equal what the server's delete check counts.** `usageFromDataset` in `src/domain/engine/recordUsage.ts`
  is the reference, so a record is deletable exactly when its counts are all zero. A new kind of record that can block a
  delete needs a new count in the reference, the SQL and the Settings lists (`dbUsage.parity.test.ts`).
- **The export reads a ledger in chunks of one table, by primary key, and the dataset is its specification.**
  `readExportChunk` backs `GET /api/expenses/export` and, in the same process, the backup (a worker with D1 and R2
  bindings has no Access session to call the route with). `EXPORT_TABLES` is in restore order and `EXPORT_CHUNK_ROWS`
  bounds every table. A new dataset table or column needs a new entry or mapper there and a raise of `EXPORT_FORMAT`. A
  parity test fails when the chunks put end to end stop equalling `loadDataset`'s table.

### In the browser

- **The Transactions list draws only the rows near the screen once it passes 300 rows** (`WINDOW_FROM_ROWS`). Padding
  stands in for the rest, so the page keeps the whole list's length and the sticky day headers still stick. Whatever
  changes a row's height (select mode swaps its markup) has to be part of the `signature` that `TransactionList` hands
  `WindowedGroups`, or heights learned under the old layout carry into the new one. Select-all and a day's checkbox work
  from the data, not the DOM. The browser's Find cannot see rows that are not drawn, and the search box can. The
  geometry is in `src/ui/hooks/windowLayout.ts`.
- **The ledger is read in parts, and the parts count only together.** `loadLedger` (`src/data/ledgerLoader.ts`) reads
  the reference first and the rows and sums after it. A part with another revision was read after a write, so the
  reference is read again and only parts that still carry its revision are kept. After three attempts the load throws
  `LedgerChangedError`, so a ledger that is written to constantly never yields a mix of two states. The browser's HTTP
  cache does the revalidation: a request that names `If-None-Match` itself skips that cache, so the client sends none,
  and a 304 that reaches it anyway is read again past the cache. A server without the routes, or a body of another
  shape, is a `PartsUnavailableError`, and the caller loads the whole dataset. Requests stay inside the route bounds
  (`planRowRanges`, `planCubeRanges`), and a ledger built from parts has no receipt list, since a row's receipts are
  read when needed.
- **A screen reads one of two row lists, and the wrong one is wrong only when the model holds a window.**
  `ExpenseModel.dataset.transactions` is the real rows: what is shown as a transaction and what engines that read dates,
  descriptions, labels or links are given. `sumsOf(model)` adds one row per summed cell and goes to the engines that
  only add amounts and to the spending groups. While the model holds every row there are no cells and both lists are the
  same array. For a window the model also carries `history`, the recurring series of the whole history, which the
  Overview and Spending hand to the engines that would otherwise classify fixed spend from the rows they are given. A
  new screen that adds amounts reads `sumsOf(model)`, and one that lists or searches rows reads `dataset`.
  [ENGINE-HISTORY.md](./ENGINE-HISTORY.md) says which engine is which. A list that shows a month the model holds only as
  sums shows nothing for it, never a cell. A model built from `dataset` alone (`applyPatch` in `useExpenseData.ts`) has
  no `sums` or `history`, so it is right only for a model that holds every row. `ledgerModelSweep.test.ts` holds the
  readings the Overview, the Spending view and the monthly tables make to the same readings over every row.

## Size and complexity

ESLint enforces `max-lines: 200`, `max-lines-per-function: 60`, `complexity: 12` and `max-depth: 3` (see
`eslint.config.js`). They are a proxy for "this file or function is doing one thing", so split before disabling.

## Testing

See [TESTING.md](./TESTING.md) for the test pyramid and how to exercise each layer.
