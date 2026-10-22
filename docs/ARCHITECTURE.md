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
- **A field the running client reads is dropped in a later release.** An installed app keeps its old code until its
  owner taps the update banner, and re-reads the data meanwhile. `GoalScenarioDto` (`functions/_shared/rows.ts`) still
  sends `annualContributionGrowth` as 0 for that reason: without it a client opened before the deploy multiplies
  `undefined` into every projection and the Goals tab shows NaN until reload.
- **Personal data never reaches a tracked file, and new deployment identifiers should not.** The source is public.
  Commit a placeholder (`owner@example.com`) with a comment telling whoever applies the change to substitute the real
  value, and keep real per-deployment config gitignored beside a committed `*.example.json`. `scripts/check-pii.mjs`
  fails `npm run verify` on a tracked email outside an allowlist of exact addresses, and it does not look for deployment
  identifiers. Several tracked files still hold the maintainer's (the Cloudflare account id, database, project and
  hostname names in the workflows, `workers/backup-cron/wrangler.toml`, the `.env.*` files, `config/staging-access.json`
  and some scripts), and a fork has to replace them ([DEPLOYMENT.md](./DEPLOYMENT.md)). New code reads such values from
  config or the environment.

### Dataset revision

- **Every write moves the owner's revision, so a matching ETag means nothing changed.** A write that does not move it
  leaves browsers on stale data until the owner's next write. The paths that change the dataset's tables are:
  - `functions/api/_middleware.ts`, which replaces it before and after every request that is not a GET, HEAD or OPTIONS.
    The second replacement also runs when the handler throws or answers an error, since the write may have landed, and
    is retried once. The first one reads the token it replaces in the same batch and hands it to the handler as
    `context.data.revisionBeforeWrite`. A route that takes the revision its user was looking at (`expectedRevision`)
    compares it with that, through `assertRevisionUnchanged`, and never with the table, which by then holds the new
    token.
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
- **The resumable backup is a bounded walk of the export, and a backup exists when its manifest does.**
  `runScheduledBackup` is the one place that chooses: `runChunkedBackups` when `BACKUP_MODE` is `chunked`, otherwise
  `runAllBackups`, the single-file snapshot, whose calls `backupOldPath.test.ts` pins (a merge redeploys the worker). An
  invocation spends a budget of calls and rows and keeps back what it needs to finish. State is saved only after the
  rows it counts are in a part, and the manifest is written last, so a kill at any point leaves a run the next
  invocation continues. A pass is redone if the owner's revision moved. A new `EXPORT_TABLES` entry needs a row in
  `MAPPERS` in `restoreSql.ts` (the types require it), or a backup would hold rows a restore cannot write. Nothing in
  the code writes a backup back into a database ([BACKUPS.md](./BACKUPS.md)).

### Bulk writes

- **A bulk write on a filter is refused unless the user's view still holds, and it is one atomic batch.** `PATCH
  /transactions/bulk` and `POST /transactions/bulk/labels` with a filter find the ids with `idsSql` (the list's WHERE,
  capped at `MAX_FILTER_EDIT_ROWS`, the summary's count cap: refused above it and never cut), compare the count and the
  revision, and write through `planBulkUpdate`, which the ids form uses too, so a new rule for a bulk patch goes there.
  The batch starts with a guard (`matchGuardSql`, built on `batchGuard.ts`) that fails unless exactly the ids that were
  read still match, so nothing is written when the ledger moved in between, and a settling batch ends with a second one.
  A settle conflict that appears after the check undoes the batch (409) instead of committing the rows that qualified.
  The filter is validated by `validateTxnFilter`, the validator of the paged reads, and `dbBulkEdit.parity.test.ts`
  holds the SQL to the engine's own filter. The cap is raised only after the rows written per edit are measured on a
  deployed D1. A delete never takes a filter ([decision](./decisions/no-filter-based-delete.md)).

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
  (`planRowRanges`, `planCubeRanges`), and a ledger built from parts has no receipt list: the parts count a row's
  receipts, and a screen that shows them asks for the lists it needs through `model.ensureReceipts` (the edit sheet for
  its transaction, a claim for its rows, the storage meter for all of them). A few lists are one request each; more
  than a few are one request for every receipt the owner has ([`GET /attachments`](./API.md#get-attachments)).
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
- **A ledger held open changes by patching writes in, and what a write moved is read again.** `LedgerSession`
  (`src/data/ledgerSession.ts`) holds the reference, the pinned rows, the rows of the months being looked at and the
  sums of every month. A write is patched into the rows held at once, and `reconcileHeld` names the months whose sums
  it moved (a row in a month that is not held, a row that stops being pinned) for the session to read again, because
  the browser cannot tell what a write did to months it does not hold. Reads are guarded per resource: a write to the
  rows drops a read of the rows that started before it and leaves a read of the reference alone, so an old value is
  never shown again, and a refresh that a later refresh has overtaken is dropped, failure included, whichever answers
  first. A write also makes the held revision unknown until a part is read again, so the next read of another month
  reads everything rather than mixing two states. Months held beyond the window around the month shown are given up
  oldest first, and a ledger held in full gives up nothing.
- **A windowed model's `history` is the server's recurring series, read when a screen that uses them mounts.** A series
  needs every row it is made of, which a window does not hold. A screen that reads `history` (the Overview, Spending,
  the Upcoming card) calls `useHistoryWatch(model)`, and `LedgerSession.watchSeries` reads
  [`GET /series`](./API.md#get-series) into `SessionState.series` when they are missing or stale. The server reads every
  row for them whenever the revision has moved, about ten rows per transaction, so they go stale only after a write that
  could change one (`touchesSeries`: a row that counts was added, removed or edited in what a series is made of, which a
  flag, a label or a note is not), after a refresh that found another revision, or when the rows and the series were read
  at different revisions. They are read when the next screen mounts, never on a timer, and not while a screen that uses
  them is already showing, except on a refresh (the user's, or the one a write that moves more than its patch shows
  starts), which reads them once. `useLedgerData` folds the rows written since they were read into them (`foldNewerRows`), so
  logging the charge the Upcoming card offers clears it at once, and the Overview and Spending keep the split as of the
  last read until then. While the model has no `history` (the first read has not landed, it failed, or the browser is
  offline) it says so (`historyNote`, which `HistoryNote` shows): the figures that need it use the months loaded, and the
  Upcoming card offers nothing, because the rows of a window can show a charge as regular that the whole history does
  not. A read that fails, or finds the ledger at another revision three times, is reported and not started again for a
  minute, and a refresh lifts that. A screen that starts reading `history` calls the hook.
  `ledgerSeries.client.integration.test.ts` holds those readings, and the card after a write, to those of every row, over
  the real routes.
- **A write the server answers with more than the patch shows is followed by a read of the whole ledger, not by a hand
  mirror of its effects.** `cascadeOf` (`src/data/ledgerCascade.ts`) recognises these from what the patch did to the
  dataset: deleting a category, account, flag, label or plan, giving a flag an auto-label or a row a flag that has one,
  adding or changing a plan, and settling rows or deleting the payment that settled them. A new server-side cascade
  needs a case there and a test. A read in the background that fails (after a cascade, of a month or of a receipt list)
  is kept in `SessionState.error` until a refresh works, because what is shown may then be out of date;
  `useLedgerData` returns it as `backgroundError` for the app to tell the user.
- **A write to rows the browser may not hold is followed by a read of what it moved, not by a patch.** The patch
  functions only map the rows the session holds, so an edit or delete of a row on a page of the list, or of the rows a
  filter matches, whose month is held only as a sum would change nothing here: not the month's sums, not the series, not
  the list. `useExpenseActions` passes each row write's reach (`WriteReach`: the ids it named and the fields it wrote)
  to `LedgerSession.patch`, which reads the rows and sums again, once, if any id was not held as a row (asked before the
  patch removes it), and notes the series stale only if the fields written could change one (`reshapesSeries`; rows
  added or removed always could). A ledger held in full holds every id and needs nothing more. A write that answers
  with counts and not rows (labels added through the bulk route, an edit on a filter) names no ids and is always
  followed by the read, and so is a bulk write that fails, since part of it may have gone through.
  `ledgerWrites.client.integration.test.ts` holds the sums after each kind of write to those of a fresh read.
- **The offline snapshot of a ledger is one record per owner, read-only, and never fails a load.**
  `saveLedgerSnapshot` (`src/data/ledgerSnapshot.ts`) keeps the current owner's held ledger under a key that names them
  and removes every other owner's, so a second person on the same browser never opens the first one's figures from
  this snapshot. A record from another build (`SNAPSHOT_VERSION` moves with every required dataset field, as for the
  whole-dataset snapshot), another ledger format or another owner is discarded when it is found. Saving and loading
  never throw. Offline, or when a read fails, the session holds the snapshot: it reads nothing, refuses writes, and a
  refresh that reads ends it. The whole-dataset snapshot in `offlineCache.ts` shares no key with it and is not kept per
  owner (its one record, `latest`, is whoever loaded last), so when the ledger path hands back to the whole-dataset app
  offline, that app can still show it.
- **Reading the ledger in parts is a switch in the browser, off by default, and a browser without it runs the old load
  unchanged.** `ExpensesApp` reads the mode once (`src/config/ledgerMode.ts`). `off` renders the whole-dataset app and
  nothing else runs. `on` and `shadow` load `LedgerExpensesApp`, a lazy chunk that is handed the app's view as a prop
  (importing it back makes the bundler split shared code into files every browser loads at startup). The service
  worker precaches the chunk for every browser, so it is downloaded and not run. The chunk hands back to the
  whole-dataset app for a ledger over `FULL_HYDRATION_ROW_LIMIT`, for a source without parts, and for an offline
  browser whose snapshot is missing, another owner's, or holds only a window. The limit holds for the life of the
  session (`refuseWindow`): a read or a snapshot that would hold only a window is kept out and the app hands back,
  which starts it over, so a screen that lists every row never lists part of the ledger and the switch only ever holds
  a ledger in full. `shadow` is honoured in development and staging builds only; there `ledgerShadow.ts` compares the
  held ledger with the whole dataset and reports, and shows nothing. A read in the background that fails raises a
  toast that offers to read again.
- **A list read in pages is held by position, and a statement payment waits for its day.** `TransactionPager`
  (`src/data/transactionPager.ts`) reads `GET /transactions/list` a page at a time for one filter and hands the
  server's cursor back as it came, with the filter the list started with. It never rebuilds a cursor from its rows or
  from the filter the screen holds now, so a filter that changed under a cursor (the month rolled over at midnight)
  starts a new list. A row edited after its page was read can arrive again on a later page, and the later copy
  replaces the earlier. Statement payments are not served: they come from the statements and the cash rows and sort
  after the transactions of their day, so `pagedListRows` leaves one out until a row of an older day, or the end of the
  list, shows that no more of its day is coming. A screen calls `refresh()` after a write: paging by position cannot
  show a row that moved to a place behind the cursor or drop one deleted from the pages already read. `refresh()` reads
  the list again down to the depth it had and swaps it in when every row is there, so the reader keeps their place.
  While no screen is attached (`attach()`) a refresh is only noted, and made when one attaches. Only a change of the
  search text waits for the settle time, any other change of filter is read at once, and a read that a newer filter
  outlived is cancelled. The count and net spend come from `GET /transactions/summary`, apart from the rows, when the
  filter changes or a refresh asks, and `summaryStale` says when they may no longer fit the rows.
- **In ledger mode the Transactions tab asks the model for its list, and the list is read in pages.** The model
  carries a `pagedList` (a `TransactionPager` and the hook that gives the tab its rows), and a model without one is
  listed from the rows it holds as always, so nothing changes with the mode off. The tab hands its filter to the
  hook and takes back the rows with the statement payments merged in, the net spend and a count that says `1000+`
  when the summary stopped counting. A footer under the list reads the next page when the end comes near the
  screen and offers to try again when one failed, and never retries by itself. While the model is read-only the rows
  it holds are listed, since there are no pages to read.
- **Selecting every row a filter matches is selecting the filter, with the count and revision the user was shown.**
  `TransactionPager.matching()` gives them while the figures fit the list (the filter is not being typed, nothing is
  being read, and the count is not capped: an edit reaches at most 1,000 rows). The choice keeps that count and revision
  as they were, since the server answers 409 and changes nothing if either has moved. The refusal lets go of the choice
  and the figures are read again before the user chooses once more. A new filter, or picking or clearing a row, ends it.
  It offers no delete, because a delete names its ids (the browser sends more than 500 in several requests), and a
  rename cannot say what it replaces, since only the rows on screen are known. With labels and an edit together the
  labels go first, as adding them never changes which rows match, and the revision is read again between the two
  requests. A list that does not hold every row cannot tell a chosen row it no longer shows from one deleted elsewhere,
  so it counts it as not shown.

## Size and complexity

ESLint enforces `max-lines: 200`, `max-lines-per-function: 60`, `complexity: 12` and `max-depth: 3` (see
`eslint.config.js`). They are a proxy for "this file or function is doing one thing", so split before disabling.

## Testing

See [TESTING.md](./TESTING.md) for the test pyramid and how to exercise each layer.
