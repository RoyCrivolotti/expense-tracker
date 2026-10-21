# Architecture — expense-tracker

Ports-and-adapters (hexagonal). The domain layer knows nothing about D1, HTTP, or React; UI and
Functions are both adapters around it.

## Layers

| Layer | Location | Depends on | Knows about |
| --- | --- | --- | --- |
| **Engine** (pure compute) | `src/domain/engine/` | Nothing | Money formatting, dates, budget totals, cash reconciliation, transaction status, goals math |
| **Ports** (interfaces) | `src/domain/ports/` | Domain types only | `ExpenseRepository`, `AccessRepository`, `AuthProvider`, `BackupStore`, `EmailSender` — shapes the UI and Functions code against, never a vendor SDK |
| **Application** (use cases) | `src/domain/application/` | Ports, engine | Orchestration that needs more than one repository call (`installmentPlanService`, `transactionService`, `transactionQueryService`, `ledgerPartsService`, `goalService`, `categoryService`) |
| **Data** (parsing) | `src/domain/data/` | Domain types | CSV import/export parsing, transaction ID helpers — pure, no I/O |
| **Adapters — backend** | `functions/_shared/adapters/` | Ports | `d1ExpenseRepository`, `d1AccessRepository`, `r2BackupStore`, `cloudflareEmailSender`, `cloudflareAccessAuth` |
| **Adapters — frontend** | `src/data/`, `src/testing/` | Ports | `apiDataSource` (HTTP client), `csvDataSource`, `inMemoryExpenseRepository` (test double) |
| **Driving side — API** | `functions/api/` | Application, ports | Cloudflare Pages Functions HTTP handlers |
| **Driving side — UI** | `src/ui/` | Application, engine, data | React components; no direct D1/HTTP, always through `src/data/` |

`src/engine/`, `src/types.ts`, and similar top-level re-export barrels exist only so older imports
keep working — the real implementation is always in `src/domain/`. Prefer importing from
`src/domain/` directly in new code.

## Invariants worth knowing before you change them

- **Transaction status is derived, never stored.** `src/domain/engine/status.ts` computes
  posted/forecast/cancelled from the account's settlement and whether its statement for the
  transaction's budget month is paid, on every read. There is no `status` column — if you
  find yourself wanting to persist one, that's a signal the derivation logic needs fixing instead.
- **Row-level tenancy via `owner`.** Every table keyed by `owner` (the authenticated email); every
  D1 query in `functions/_shared/adapters/d1ExpenseRepository.ts` filters by it. New tables and
  new queries must follow the same shape — a query without an `owner` predicate is a cross-tenant
  data leak.
- **Currency/number-format settings are display-only.** They change symbol and decimal separator
  for every transaction (past and future); amounts are stored as locale-neutral integer cents and
  are never converted. See `src/domain/engine/money.ts`.
- **In-memory repository mirrors the D1 adapter's validation and FK behavior.**
  `src/testing/inMemoryExpenseRepository.ts` is a full test double, not a stub — when you add
  validation or a cascade/unlink behavior to the D1 adapter, add the same behavior here or tests
  will pass against the double while the real backend rejects (or worse, silently corrupts) the
  same input.
- **Categories and accounts with references are deleted only via reassign, never orphaning a
  record.** An unused category/account deletes outright; one still referenced by a transaction,
  installment plan, or (for accounts) an account statement requires a `reassignToId` or an inline
  `createCategory`/`createAccount` payload. The reassign (move referencing rows) + delete run as a
  single `env.DB.batch(...)`, so a mid-batch failure can't leave rows pointing at a deleted id. An
  inline create is **not** part of that batch — D1 can't reference a statement's own result (the
  new row's id) from a later statement in the same `batch()` call, so the create runs first as its
  own statement, then the batch. If the batch then fails, the newly-created category/account is
  cleaned up on a best-effort basis (not itself atomic with the failure) rather than left behind
  unused. See `deleteCategory`/`deleteAccount` in `functions/_shared/dbConfig.ts`. Archiving
  (`active: false`) is unrelated and never blocked by usage — it only affects which
  categories/accounts new/edited transactions can pick, not deletion.
- **Reassign targets (existing records to move to) must be active.** Both the reassign-target
  dropdown and the pickers in `TransactionFields`/`InstallmentPlanForm` exclude inactive
  categories/accounts — same "active = archive" rule in both directions: don't offer linking new
  data to something archived. The one standing exception is a form's own current value: an
  already-linked (possibly inactive, or in rare legacy-data cases fully deleted) category/account
  stays selectable so editing an unrelated field never breaks the form. See
  `src/ui/components/pickerOptions.ts`.
- **Public GitHub source.** Real emails (beyond a clearly-named demo account), financial figures,
  and other personal identifiers must never land in a tracked file. Follow the placeholder +
  comment pattern already used in `migrations/0003_multi_user.sql` and
  `0011_user_preferences.sql`: commit a placeholder (`owner@example.com`) with a comment telling
  whoever applies the migration to substitute the real value first. Real per-deployment config
  stays gitignored with a committed `*.example.json` sibling, e.g.
  [`config/access.example.json`](../config/access.example.json). `npm run verify` (and therefore
  both CI workflows) runs `scripts/check-pii.mjs`, which fails the build on any tracked-file email
  outside an explicit allowlist — extend the allowlist there by exact address, not by domain,
  when adding a new legitimately-safe one.
- **Dataset revision: every write moves it, so a matching ETag means nothing changed.**
  `owner_revision` holds one random token per owner. `GET /api/expenses` builds a weak ETag from
  it and the owner's current budget month, and answers a matching `If-None-Match` with 304
  before it loads anything. A write that does not move the token leaves browsers on stale data
  until the owner's next write, so every path that changes the dataset's tables has to:
  - `functions/api/_middleware.ts` replaces it before and after every request that gets past
    auth and is not a GET, HEAD or OPTIONS. A new write route needs nothing; a new GET route
    must not write the dataset's tables, apart from the two exceptions below. The second bump also runs when the handler throws or answers with an error
    (the write may have landed), and is retried once.
  - `backfillInstallments` replaces it when it inserted rows. It writes during a GET
    (`/api/expenses` and `/api/expenses/reference`), and the backup reaches it through `loadDataset`.
  - Filling `transactions.description_norm` is the other write a GET makes (the series route, and the
    routes that search by description). It does not replace the revision: the column is derived from
    `description` and appears in no response, so a browser that holds the current dataset still holds the
    current dataset.
  - `purgeOwnerData` deletes the row.
  - Anything else that writes those tables outside the API (a seed script, SQL by hand, a data
    migration) deletes or replaces the owner's row, as the generators in `scripts/` do.

  The ETag is read before the data it describes. A write in between leaves the tag older than
  the data, which costs one reload; the other order could pair a new tag with old data. A change
  to the JSON that `loadDataset` returns means raising `DATASET_FORMAT` in
  `functions/_shared/datasetEtag.ts`, or browsers keep the old shape under a tag that still
  matches (`datasetEtag.test.ts` fails when the shape moves). Each write request costs two more
  rows written against the Free plan's daily budget.
  `datasetRevision.integration.test.ts` derives the list of write routes from the route files and
  fails for a route that has no test case.
- **The Transactions list renders only the rows near the screen once it passes 300 rows.**
  Padding stands in for the rest, so the page is as long as the whole list and the sticky day
  headers still stick (a day stays one `.group`). Each rendered row sits in a `data-vrow`
  wrapper, which is what gets measured; heights not yet seen are guessed from rows of the same
  shape. Whatever changes how tall a row is (select mode swaps the row's markup) has to be part
  of the `signature` `TransactionList` hands `WindowedGroups`, or heights learned under the old
  layout carry into the new one. Select-all and a day's checkbox work from the data, not the
  DOM. Find in the page cannot see rows that are not rendered; the search box can. The geometry
  is in `src/ui/hooks/windowLayout.ts`.
- **Paged transaction reads run the engine's filter in SQL, and a test holds them to it.**
  `queryTransactions`, `summarizeTransactions` and `getTransaction` on `ExpenseRepository` back
  `GET /api/expenses/transactions/list`, `/summary` and `/:id`. `filterTransactions` in
  `src/domain/engine/transactions.ts` is the specification: `functions/_shared/transactionQuerySql.ts` is the
  only place a `TxnFilter` becomes SQL, `inMemoryExpenseRepository` answers with the engine itself, and
  `dbTransactionQuery.parity.test.ts` checks that the pages concatenated equal `filterTransactions` over the
  served dataset for random filters, page sizes and awkward rows. A new filter field therefore needs five
  things: the engine, its SQL clause, the filter generator in `src/testing/transactionQueryKit.ts`, a
  validator in `transactionQueryService.ts` and its query-string name in `transactionQueryParams.ts`. Every value is bound, never spliced into the text, and the number
  bound per statement is fixed by the filter's shape (D1 allows 100); lists travel as one JSON string read with
  `json_each`. The owner comes from the session, never from a filter or a cursor.
  `transactionQueryPlans.test.ts` runs each statement shape through `EXPLAIN QUERY PLAN` and fails on a full
  scan of `transactions`, or on a sort where the rows should come off an index in order.
- **Ledger parts are served separately, and the ledger model with its tests is the specification.**
  `readLedgerReference`, `readMonthRows` and `readMonthCells` on `ExpenseRepository` back
  `GET /api/expenses/reference`, `/transactions/months` and `/cube` (`docs/SCALING.md`, "Ledger parts").
  `src/domain/ledger/partsOfDataset.ts` answers them with `partitionPinned` and `buildCells`, and
  `dbLedgerParts.parity.test.ts` holds the SQL in `ledgerPartsSql.ts` to that over the synthetic, adversarial and
  random ledgers, then assembles the three parts and runs the engines over them. A part carries the owner's
  revision token in its body and answers `If-None-Match` as the dataset does; a change to its JSON means raising
  `PARTS_FORMAT` in `datasetEtag.ts` (`ledgerPartsEtag.test.ts` fails otherwise). The pinned rule is written four
  times: `isPinned`, `PINNED_SQL` and `UNPINNED_SQL` in `ledgerPartsSql.ts`, and the predicate of `idx_txn_pinned`
  (migration 0037, which SQLite only reads when the statement holds the same terms). Changing it means changing all
  four, with a new migration for the index, because a deployed index cannot be edited. Each range is capped by
  constants in `src/domain/data/ledgerParts.ts` and refused beyond them, never cut short. The routes do not
  write, apart from the installment backfill that `reference` runs when its ETag misses. `ledgerPartPlans.test.ts`
  fails on a full scan of `transactions` or on a pinned read that no longer uses the index.
- **`transactions.description_norm` is the app's normalized description, written by every statement that
  writes a description.** The app groups and compares descriptions with `normalizeDesc` (`trim()`, then
  `toLowerCase()`), which is Unicode-aware; SQLite's `lower` is ASCII-only and its `trim` strips only
  spaces, so SQL that grouped or searched on `lower(trim(description))` would answer differently for
  "CAFÉ" or a tab. The column holds the JavaScript result, and anything that groups or searches by
  description in SQL uses it and never the SQL functions. A statement that inserts into `transactions` or
  updates `description` has to set it too (`functions/_shared/dbWrite.ts`, `dbInstallmentBackfill.ts`, the
  seed generators); `descriptionNormWrites.test.ts` fails for one that does not, and a migration that
  writes descriptions has to as well. NULL means "not computed yet": rows that predate migration 0038
  are filled by `fillDescriptionNorm`, a bounded chunk per request, and a read that groups by the column
  first makes sure none are waiting and answers 503 until then. The column appears in no response and
  filling it does not move the dataset revision.
- **The recurring series are computed over the whole history on the server, and a test holds them to the
  engine.** `readSeries` on `ExpenseRepository` backs `GET /api/expenses/series`. `seriesFromTransactions`
  in `src/domain/engine/recurringSeries.ts` is the specification: it reduces what `groupTransactions`
  builds to what the detectors read, `inMemoryExpenseRepository` answers with it, and
  `functions/_shared/seriesSql.ts` (the only place a series becomes SQL) must give the same series,
  row for row and in the same order, which `dbSeries.parity.test.ts` checks on random, adversarial and
  accented ledgers. `seriesConsumers.parity.test.ts` then runs every consumer from the served series and a
  window of rows against the answer over every row. A change to what a detector reads of a series (a new
  field on `OccurrenceGroup` that something uses, a larger history constant) means changing
  `RecurringSeries`, the SQL, and `PARTS_FORMAT` in `datasetEtag.ts`; the route's shape test fails until
  it is raised. The route is served as a ledger part (a revision token in the body, `If-None-Match` answered
  with a 304) and writes only `description_norm`, which is not part of the dataset.
- **Description autocomplete is one order, shared by the browser and the server, and a test merges them.**
  `src/domain/engine/descriptionSearch.ts` holds the order (the collator over the normalized text, then the
  text) and the prefix range; `buildDescriptionIndex` and `functions/_shared/dbDescriptionSuggest.ts` both use it.
  `suggestDescriptions` on `ExpenseRepository` backs `GET /api/expenses/descriptions/suggest`, which answers for
  rows booked before a month (the browser's oldest); `buildDescriptionIndex` over those rows is the reference (`inMemoryExpenseRepository`
  answers with it) and `mergeDescriptionMatches` joins the answer to the browser's own matches.
  `dbDescriptionSuggest.parity.test.ts` holds the SQL to that and checks that the merge equals the index over every
  row. A description's place in the order must never depend on which of its rows is newest, or the merge stops
  being exact; that is why the `key` order reads the normalized text and not the label. The index keeps its original
  `label` order as the default until the app starts merging. The statement skips from one
  description to the next through `idx_txn_owner_desc_norm`, and `descriptionSuggestPlans.test.ts` fails on a scan
  or a sort.
- **Usage counts come from the owner's rows through an owner index, and a test holds them to the dataset.**
  `readUsage` on `ExpenseRepository` backs `GET /api/expenses/usage`. `usageFromDataset` in
  `src/domain/engine/recordUsage.ts` is the reference (`inMemoryExpenseRepository` answers with it);
  `functions/_shared/usageSql.ts` is the only place the counts become SQL, and `dbUsage.parity.test.ts` checks it
  against the reference, against the counts the Settings lists compute, and against what `deleteCategory` and
  `deleteAccount` accept. A count is what the server's delete check counts, so a record is deletable exactly when
  its counts are all zero; a new kind of record that can block a delete means a new count here, in the reference
  and in the lists. The statement groups `transactions` by `category_id + 0` on purpose, and
  `usagePlans.test.ts` fails if it ever reads another owner's rows or scans `transactions`.
- **The browser reads the ledger in parts, and the parts count only together.** `loadLedger`
  (`src/data/ledgerLoader.ts`) reads the reference first and the rows and sums after it. Every part carries the
  owner's revision token. A part with another token was read after a write, so the reference is read again and only
  the parts that still carry its token are kept; after three attempts the load throws `LedgerChangedError`, so a
  ledger that is written to constantly never yields a mix of two states. The browser's HTTP cache does the ETag
  revalidation: a request that names `If-None-Match` itself skips that cache, so the client sends none, and a 304 that
  reaches it anyway is read again past the cache. A server without the routes, or a body of another shape, is a
  `PartsUnavailableError`, and the caller loads the whole dataset as it always did. Requests stay inside the route
  bounds (`planRowRanges`, `planCubeRanges`); a month over the row bound cannot be read this way. A ledger built from
  parts has no receipt list (`reference.attachments` is empty): a row's receipts are read when needed. The demo data
  sources serve their parts from the dataset they hold (`partsOfDataset.ts`), so a dev instance takes the same path.

- **The export reads a ledger in chunks of one table, by primary key, and the dataset is its specification.**
  `readExportChunk` on `ExpenseRepository` backs `GET /api/expenses/export` and, in the same process, the backup
  (a worker with D1 and R2 bindings has no Access session to call the route with). `EXPORT_TABLES` is in restore
  order, `EXPORT_CHUNK_ROWS` bounds every table, and rows are the shapes `rows.ts` maps for the dataset, so a new
  dataset table or column means a new entry or mapper there and a raise of `EXPORT_FORMAT`. A parity test fails
  when the chunks put end to end stop equalling `loadDataset`'s table, and a plan test fails on a scan or a sort.

## Size and complexity

ESLint enforces `max-lines: 200`, `max-lines-per-function: 60`, `complexity: 12`, `max-depth: 3`
(see `eslint.config.js`). These aren't arbitrary: they're a proxy for "this file/function is doing
one thing." Split before disabling.

## Testing

See [docs/TESTING.md](./TESTING.md) for the test pyramid and how to exercise each layer.
