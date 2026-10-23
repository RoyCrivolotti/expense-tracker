# Ledger mode

For a contributor changing how the browser holds and reads a ledger in parts: the switch, the session, the lists read in
pages and the writes, with the rules each one keeps. What each route answers is in [API.md](./API.md), and why the design
is what it is in [SCALING.md](./SCALING.md) and [the decision record](./decisions/ledger-model.md). The rules that hold
for the whole app are in [ARCHITECTURE.md](./ARCHITECTURE.md).

**Status.** The app holds a ledger only in full: up to `FULL_HYDRATION_ROW_LIMIT` (5,000) rows, and a larger ledger
hands back to the whole-dataset app. Behind the switch it is loaded in parts and its Transactions list is read in pages.
The windowed behaviour described below (a window of months with per-month sums, the series, older descriptions, the
server's usage counts, reading back writes to rows that are not held) is built and tested but cannot occur, because
`LedgerExpensesApp` passes `refuseWindow: true`. Lifting the limit changes four places together (the constant,
`choose()`, that literal and the offline snapshot's `cells === null` check), and each screen that lists every row then
has to decide what a window may show.

## The switch and the hand-back

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

## Reading in parts

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
  readings the Overview, the Spending view and the monthly tables make to the same readings over every row, and
  `ledgerPinnedReadings.client.integration.test.ts` those the Flagged card, expense and past reports, reimbursement
  links and instalment plans make, from a session moved between months and written to, over the real routes. They
  read rows whatever their age, so they are right only while every row they follow is pinned.

## The session

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
- **A write the server answers with more than the patch shows is followed by a read of the whole ledger, not by a hand
  mirror of its effects.** `cascadeOf` (`src/data/ledgerCascade.ts`) recognises these from what the patch did to the
  dataset: deleting a category, account, flag, label or plan, giving a flag an auto-label or a row a flag that has one,
  adding or changing a plan, and settling rows or deleting the payment that settled them. A new server-side cascade
  needs a case there and a test. `patch()` answers true for a cascade, and for a card statement marked paid or
  unpaid, as it does for a change to a row, so the list read in pages is read again (`applyWrite`): the server moved
  rows the patch cannot show. A plan's instalments are inserted by the server when the ledger is read, so for a plan the
  list is read after that read has finished (`afterPlanWrite`). A read in the background that fails (after a cascade, of a month or of a receipt list)
  is kept in `SessionState.error` until a refresh works, because what is shown may then be out of date;
  `useLedgerData` returns it as `backgroundError` for the app to tell the user. So is a read of the list that failed
  after a write or a refresh, until a read of it works, and a refresh whose read of the list failed finishes as failed
  and not as updated.
- **A write to rows the browser may not hold is followed by a read of what it moved, not by a patch.** The patch
  functions only map the rows the session holds, so an edit or delete of a row on a page of the list, or of the rows a
  filter matches, whose month is held only as a sum would change nothing here: not the month's sums, not the series, not
  the list. `useExpenseActions` passes each row write's reach (`WriteReach`: the ids it named and the fields it wrote)
  to `LedgerSession.patch`, which reads the rows and sums again, once, if any id was not held as a row (asked before the
  patch removes it), and notes the series stale only if the fields written could change one (`reshapesSeries`; rows
  removed always could). A ledger held in full holds every id and needs nothing more, and a row the write added is not
  one the session can be missing: the patch counts it in its month and that month's sums are read again. A write that
  answers with counts and not rows (labels added through the bulk route, an edit on a filter) names no ids and is always
  followed by the read, and so is a bulk write that fails, since part of it may have gone through.
  `ledgerWrites.client.integration.test.ts` holds the sums after each kind of write to those of a fresh read.
- **A windowed model's `history` is the server's recurring series, read when a screen that uses them mounts.** A series
  needs every row it is made of, which a window does not hold. A screen that reads `history` (the Overview, Spending,
  the Upcoming card) calls `useHistoryWatch(model)`, and `LedgerSession.watchSeries` reads
  [`GET /series`](./API.md#get-series) into `SessionState.series` when they are missing or stale. The server reads every
  row for them whenever the revision has moved, about ten rows per transaction, so they go stale only after a write that
  could change one (`touchesSeries`: a row that counts was added, removed or edited in what a series is made of, which a
  flag, a label or a note is not), after a write the server cascaded (a plan deleted turns its instalments into rows of a
  series), after a refresh that found another revision, or when the rows and the series were read at different
  revisions. They are read when the next screen mounts, never on a timer, and not while a screen that uses
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
- **The offline snapshot of a ledger is one record per owner, read-only, and never fails a load.**
  `saveLedgerSnapshot` (`src/data/ledgerSnapshot.ts`) keeps the current owner's held ledger under a key that names them
  and removes every other owner's, so a second person on the same browser never opens the first one's figures from
  this snapshot. A record from another build (`SNAPSHOT_VERSION` moves with every required dataset field, as for the
  whole-dataset snapshot), another ledger format or another owner is discarded when it is found. Saving and loading
  never throw. Offline, or when a read fails, the session holds the snapshot: it reads nothing, refuses writes, and a
  refresh that reads ends it. The whole-dataset snapshot in `offlineCache.ts` shares no key with it. Its one record,
  `latest`, names its owner and is replaced by whoever loads next, so a load that fails or an offline start shows it
  only to the person it is for. Neither snapshot is shown when the server has answered 401 or 403, which removes it.

## Lists in pages

- **A list read in pages is held by position, and a statement payment waits for its day.** `TransactionPager`
  (`src/data/transactionPager.ts`) reads `GET /transactions/list` a page at a time for one filter and hands the
  server's cursor back as it came, with the filter the list started with. It never rebuilds a cursor from its rows or
  from the filter the screen holds now, so a filter that changed under a cursor (the month rolled over at midnight)
  starts a new list. A row edited after its page was read can arrive again on a later page, and the later copy
  replaces the earlier. Statement payments are not served: they come from the statements and the cash rows and sort
  after the transactions of their day, so `pagedListRows` leaves one out until a row of an older day, or the end of the
  list, shows that no more of its day is coming. A screen calls `refresh()` after a write: paging by position cannot
  show a row that moved to a place behind the cursor or drop one deleted from the pages already read. `refresh()` reads
  the list again down to the depth it had and swaps it in when every row is there, so the reader keeps their place, and
  settles when that read has ended: `refreshFailed` says it failed, and then the list on screen is the list before the
  write. Before that read answers, a write that is known is put into the rows held, by id (`patchRows`, from what the
  patch did to the rows): gone rows go, changed rows are replaced or leave a list their edit took them out of, and a new
  row comes in if the filter matches it and it is before the end of what was read. The read replaces all of it. While no
  screen is attached (`attach()`) a refresh is only noted, and made when one attaches. Only a change of the
  search text waits for the settle time, any other change of filter is read at once, and a read that a newer filter
  outlived is cancelled. The count and net spend come from `GET /transactions/summary`, apart from the rows, when the
  filter changes or a refresh asks, and `summaryStale` says when they may no longer fit the rows. With no row and no
  figures there is no count (`ListView.count` is null) and the header and the announcement say nothing.
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
  requests. A write from another tab in between that swaps one matching row for another leaves the count as it was, so
  the edit can reach a row the user was not shown; the server has no single request for both. Rows chosen one by one
  are edited through the filter too when they are exactly the rows it matches: that costs the same statements however
  many rows there are ([API.md](./API.md#bulk-transaction-routes) has the count). An edit by id is a handful of
  statements however many ids it names, but nothing larger than 100 has been run on D1, so by id a request names at most
  100 until one has. A list that does not hold every row cannot tell a chosen row it no longer shows from one deleted
  elsewhere, so it counts it as not shown.

## What a window cannot work out from its rows

- **A window's autocomplete is its own matches at once and the server's older ones once the typing settles.**
  `useLedgerData` gives a model that holds a window an index in the server's order (`order: 'key'`) that carries a
  `useSuggestions` hook, which `DescriptionCombobox` calls in place of `search` when it is there
  (`withOlderDescriptions`). The rows held are the browser's side and the rows booked before `olderThan(held)` are the
  server's: the oldest month of the run of months held up to the newest, so a month held beyond a gap is found on both
  sides and taken once. After `SETTLE_MS` without a keystroke, when the browser is online, `GET /descriptions/suggest` is
  asked for that prefix with the browser's locale, and `mergeDescriptionMatches` makes the answer equal the index over
  every row. Typing is never held up: a read that more typing overtook is cancelled, one that fails or is refused keeps the
  matches shown, a prefix the server calls `tooBroad` keeps the rows held until more is typed, and the matches of the
  shorter prefix that still fit stay on screen while the next is read. The older matches are merged in key order, so they
  can move what is listed: the combobox keeps the highlight as the suggestion's label and sends a click to the row that
  was pressed, so Enter and a tap accept the suggestion that was chosen. What was read lasts as long as the index, which
  is rebuilt when the rows held change. A model that holds every row has no hook and its `search` is the whole answer.
- **A window's usage counts are the server's, and a count that is not known is never zero.** Settings reads them through
  `useRecordUsage(model)`: a model that holds every row counts them from its rows, and one that holds a window carries
  `useUsage`, backed by `LedgerUsage` (`src/data/ledgerUsage.ts`). `GET /usage` is read when a screen that shows the
  counts mounts and they are missing, flagged or failed, again after a write that could change one (`touchesUsage`: a
  held row's category, account, flag or labels, or a record added or removed, or a write to rows not held that wrote
  those fields, none, or added or removed rows), and once when the rows are read at another revision than the counts.
  The browser's cache answers a read of an unchanged ledger for two rows. The counts show as a dash while none has been
  read and the delete of a category or account waits for them; when they could not be read it is left to the server's
  409, which sends the user to a reassignment. A flag or label has no such answer, since deleting one unflags its rows
  without a word, so its delete waits for counts that can be taken (`settledCount`: none while they are being read, may
  be out of date or could not be read) and its sheet says what is not known. `UsageView.note` says why counts cannot be
  taken as they are (being read, read before a write, or not readable) and `UsageNote` shows it.
