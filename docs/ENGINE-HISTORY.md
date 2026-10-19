# How much history each engine reads

Every screen runs the engines in `src/domain/engine/` over the full `Transaction[]`. This page records, for each
engine and each screen that feeds one, how much of that history its output depends on, measured from the month the
app is showing (M) and from today (T). It matters to anything that stops handing an engine the whole ledger, such as
the model in [SCALING.md](./SCALING.md) (real rows for some months, per-month sums for the rest, pinned rows that
are always real): an engine can be given less history only if its output does not change. That model is built, in
`src/domain/ledger` (see [The ledger model](#the-ledger-model)). The screens read their rows through the model's two
datasets ([How the screens read the model](#how-the-screens-read-the-model)); the app does not build a model from a ledger yet.

`src/testing/engineHistory.test.ts` pins the properties marked *tested*. It assembles the ledger with that model
(real rows for some months, one summed row per (budget month, account, category, type, cancelled, sign) cell for the
rest, pinned rows kept real) and compares each engine's output with its output on the full 60 month synthetic ledger
from `src/testing/syntheticLedger.ts`. `ledgerDifferential.test.ts` and `ledgerSweep.test.ts` repeat the comparison
for every consumer below on 80 seeded random ledgers and on every viewed month of a 60 month adversarial one.

## Terms

- **M** is the month the picker shows. The picker steps through `model.months`, the budget months that have a row,
  cancelled rows included (`buildExpenseModel`), and opens on the newest. A deep link can still set a month with no
  data (`computeOverviewKpis` handles that case). Goals and Settings have no picker, so M does not exist there.
- **T** is today. Only the open month, `defaultBudgetMonth(T)`, is ever cut to "the same days" (`sameDaysCut` in
  `analyticsPeriod.ts` returns no cut for any other month).
- **Windows count months with data, not calendar months.** `monthsForPeriod`, `computeMovers`,
  `computeSpendingGroups` and `computeSpendingBaseline` slice the `months` list, so a gap in the data stretches every
  one of them. Tested: with a five month gap the three month average reaches eight months back.
- **S** only sums amounts, so one summed row per cell gives the same output. **R** needs real rows (dates,
  descriptions, labels, or a per-row fixed or flexible call) for some months. **P** reads rows by link or by exact
  date: investments, and rows with a plan, flag or settlement. **X** needs a whole series across time.
- A summed cell carries no status. Status comes from the account, the month's statement and the cancelled flag
  (`deriveStatus` in `status.ts`), so paid and unpaid card months stay distinguishable after a statement is toggled.

## Engines

| Engine | Back from M | From T | Class | Also reads |
|---|---|---|---|---|
| `computeMonthlyTotals`, `investedYtdCents` (`monthlyTotals.ts`) | Dashboard: M only. Analytics tables and Goals: every month. Year to date: January to M | none | S | Sign of an investment: only positive amounts are contributions. A month exists once it has one counted (neither cancelled nor forecast) row |
| `computeCategoryActuals`, `computeBudgetHealth`, `computeYtdBudgetHealth` (`categoryBudget.ts`) | Dashboard: M only. Monthly summary grid: every month, and January to M | none | S | `ytdActualCents` is all-time unless `ytdThroughMonth` is passed; the grid passes it |
| `computeYearlyOverview` (`yearlyOverview.ts`) | Every month: a running total from the opening balances, so the row for X needs every month up to X | none | S | |
| `computeCashReconciliation` (`cashReconciliation.ts`) | The same running total. The Dashboard card, the statement toggles and the Transactions list each read one (month, card) charge out of it | `openMonth`, for "ready to count" (`readyToCountMonth` in `cashClose.ts`) | S | Paid flag per card; `cashActuals` months |
| `balancesAtCost` (`cashClose.ts`) | Every investment up to M, cancelled rows out and forecast rows in | none | S | The rest of `cashClose.ts` takes `CashRow[]`, not transactions |
| `buildStatementPayments` (`statementPayments.ts`) | Every paid statement. The amount is that month's card charge from the cash rows; the date is the statement's `paidOn` | none | S | |
| `averageMonthlySpendCents`, `cashReserve` (`cashReserve.ts`) | none | The 12 newest months before the open month whose net expense is not zero | S | Forecast rows are left out (the `computeMonthlyTotals` default) |
| `monthlyFlows`, `paceMonths`, `averageMonthlyCents` (`goals.ts`) | none | From the plan start (or the first month with a row) to the last month before the open month. The Goals mean runs over every month; the savings chart keeps 24 | S | A month with no row inside the range counts as zero, so month presence matters |
| `computeSpendingBaseline` (`spendingBaseline.ts`) | The 12 months with data before M, whole months | none | S | Instalment plans, not rows |
| `computeOverviewKpis` (`overviewKpis.ts`) | The period: M, January to M, or 12 months with data. The baseline: the previous month with data, the 3 before M, M-12, or the period shifted back a year (to M-23 without gaps). Sparklines: 12 months with data ending at M | Only when M is the open month: M and every comparison month are cut by date (`withinCut`); a window baseline cuts just its M-12 month | S for a closed M (tested: all 18 period, compare and basis combinations with no real rows). R, for dates, in M and the comparison months while M is open | |
| `unpaidExpenseCents` (`analyticsPeriod.ts`) | The sparkline months | none | S | |
| `computeAllocation` (`allocation.ts`) | M only | Cut while M is open | R (M) and X (classifier) | |
| `computeMovers` (`movers.ts`) | M and the 3 months with data before it | Cut while M is open | R and X | Per-row fixed call |
| `computeSpendingPace`, `expectedFixedCents` (`spendingPace.ts`) | M and M-1. The envelope reads every recurring series, and a series counts as alive from M, M-1 and M-2 | Cut while M is open | R and X | Builds the envelope's series from the rows it is given unless `fixedGroups` (`groups` for `expectedFixedCents`) is passed |
| `computeSpendingGroups` (`spendingGroups.ts`) | The 12 months with data ending at M, and the 3 before M for the average | M and the average months are cut while M is open | S for category rows outside M and the average months. R for label, description and fixed or flexible | `txnCount` is the row count of M. Builds its own classifier from the rows it is given unless `classifier` is passed |
| `computeSpendingGroupDetail` (`spendingGroupDetail.ts`) | The 12 months with data ending at M; the biggest rows of M | Cut while M is open | R, and X for fixed or flexible | Builds its own classifier unless `classifier` is passed |
| `classifyFixedSpend`, `recurringFixedGroups`, `fixedRhythm` (`fixedFlexible.ts`), `detectedFixedCosts` (`fixedCosts.ts`) | Every row of the series, before and after M | none | X | Series key: description, account, category, type (`occurrenceKey` in `recurringDetect.ts`). Three or more rows. `planId`. Cancelled and blank-description rows are out. `detectedFixedCosts` builds its own groups unless `groups` is passed |
| `detectUpcoming`, `stillStopped` (`recurringUpcoming.ts`) | none: it never looks at M | The whole series: median and regularity over every gap, then the newest 3 and 5 dates (`recurringPredict.ts`) | X | Monthly series only. Newest 3 budget offsets. `pendingDate` scans every date. `stillStopped` needs each series' newest charge (`newestChargeBySeries`) |
| `portfolioReturn`, `readReturn` (`portfolioReturn.ts`) | none | Investments dated after the first check-in, up to the last | P | Exact date and sign. A stretch where money moved and nothing was invested makes the return null. `investmentsRecorded` counts rows |
| `splitGap` (`gapSplit.ts`) | none | Investments from the first check-in on or after the plan start to the last, and any investment within 45 days of an event anniversary, which reaches back to the plan start less 45 days and on to the newest row | P | Exact date and sign |
| `planProgress`, `paidInstallmentInMonth`, `nextInstallmentSuggestion`, `calendarOffsetMonths`, `forecastPaidCount` (`installments.ts`) | Every row with a `planId`, any month | none | P | `installmentIndex` and the date of the plan's first row; counts |
| `groupTransactionsByFlag`, `buildFlagGroup`, `settledFlagId` (`flagGroups.ts`), `buildExpenseReport`, `buildSettledReport` (`expenseReport.ts`) | Every row with a `flagId` or a `settledBy`, any month | none | P | `settledBy`; `labelIds` of settled rows; counts |
| `listPastReports`, `pastReportDrifted` (`pastReports.ts`), `buildReimbursementLinks` (`reimbursementLinks.ts`) | Every row with a `settledBy` and every payment with a `reportCount` | none | P | `reportCount`, `reportCoveredCents`; counts |
| `filterTransactions`, `buildTransactionListRows`, `netSpendCents` (`transactions.ts`, `transactionListRows.ts`) | Whatever the date scope asks: M, the 3 calendar months to M, all, or a custom range. All but M filter on the row's calendar date, not its budget month | none | R, any month | `description` and `notes` search; `flagId`, `labelIds`, amount bounds; statement payments for every statement |
| `latestTransactions`, `recentlyAdded` (`transactions.ts`) | none | The 8 newest by date and the 8 newest by `createdAt` (D1 only), over the whole ledger | R | `createdAt`, `id` |
| `buildDescriptionIndex` (`descriptionIndex.ts`), `buildExpenseModel` | The whole ledger: the newest row of each description, and the `months` list from every row | none | X | Cancelled rows count for `months`. The descriptions of rows the browser does not hold come from `GET /api/expenses/descriptions/suggest` and are merged with `mergeDescriptionMatches` (see [SCALING.md](./SCALING.md)) |

The remaining engines in `src/domain/engine/` take no `Transaction[]`: `reimbursementDraft` takes a flag group,
`receiptFiles` a report, `receiptStorage` attachments, `analyticsSignals` cash rows, and the projection and goal
engines take `MonthlyFlow` or scenarios.

Measured on the synthetic ledger, the fewest real months before M that make an engine match the full ledger, with
pinned rows kept (0 means M itself). While M is the open month: 0 for the allocation, 1 for the previous month
baseline, 2 for the pace, 3 for movers, category groups and the 3 month baseline, about 11 for label and description
rows, and 12 for the year-ago baselines. For a closed month the KPIs need no real rows at all, the allocation and
category groups need M (the row count and the per-row call), and movers and pace still need 3 and 2. The label and
description figures depend on how the generator spreads labels; the 1, 3, 12 and the gap behaviour do not.

## Screens

| Screen | Reads |
|---|---|
| Dashboard totals and budgets (`DashboardTab`) | M only |
| Dashboard card statements (`CardStatementsCard`) | M only: the card charges of one month |
| Dashboard Goals card (`GoalsCard`) | T. Plan start to the last closed month, sums |
| Dashboard recent activity (`DashboardRecentActivity`) | The 8 newest by date and by `createdAt`. Ignores M, so no window around a past M holds them |
| On load (`buildExpenseModel`, `buildLookup` in `format.ts`) | The whole ledger: `months`, the description index, reimbursement links |
| Analytics Overview (`buildOverviewData` in `overviewModel.ts`) | M and the windows above. The classifier comes from the whole history. Cash rows for every month feed the signals. `AnalyticsShell` computes T |
| Analytics Spending (`SpendingView`) | M, 12 months with data. The CSV export also writes every month |
| Monthly summary grid, Monthly totals, Yearly overview, Cash reconciliation, Cash view (`MonthlySummaryGrid`, `MonthlyTotalsTable`, `YearlyOverviewTable`, `YearlyOverviewMobile`, `CashReconciliationTable`, `CashView`) | Every month as a row or column, and year to date for M's year. Sums |
| Goals plan pace and chart (`GoalsTab`, `WealthSummaryCard`) | T, no M. Sums |
| Goals return, gap and cash reserve (`WealthSummaryCard`, `ProgressPane`) | T. Pinned investments from the first check-in; month sums |
| Transactions list, total and count (`useTransactionsTabState`) | The chosen scope (`buildPeriodFilter` in `txnDateScope.ts`): M, the 3 calendar months to M, all, or a custom range, plus a synthetic row for every statement payment |
| Transactions selection (`useTransactionsTabState`, `TransactionsSelectFooter`) | Every row id; the descriptions of the selected rows by id |
| Flagged, past reports, expense report (`FlaggedCard`, `PastReportsModal`, `usePastReports`, `ExpenseReportView`) | Pinned rows, any month |
| Installments (`InstallmentsCard`) | Plan rows, any month; M for what is due |
| Upcoming (`useUpcoming`) | T, no M: the whole series |
| Settings: statement toggles (`StatementToggles`), stopped suggestions (`StoppedSuggestionsSetting`) | Every month and card; the whole series |

## The ledger model

`src/domain/ledger` splits a full dataset into a `Ledger` and assembles the row lists the engines take. It is pure
code with no I/O, and it changes no engine.

- **Pinned rows** (`isPinned`) stay real in any month: every investment, any row with a `planId`, `flagId` or
  `settledBy`, any row another row points at through `settledBy`, and any payment with a `reportCount`.
- **Hydrated months** hold every row dated in them. `chooseHydratedMonths` takes the 13 newest months with data up
  to and including the viewed month (`HYDRATED_DATA_MONTHS`). `hydratedMonthsFor` is the size policy: a ledger of at
  most `FULL_HYDRATION_ROW_LIMIT` (5,000) rows hydrates every month and has no cells, so the lists it assembles are
  the dataset's own rows and today's behavior is the degenerate case.
- **Cells** (`buildCells`) sum every other row, one per (budget month, account, category, type, cancelled, sign) with
  the summed cents and a row count. They never contain a pinned row, or an investment would be counted twice (the
  differential tests show it). A cell is kept when its sum is zero or every row in it is cancelled. A cell is a
  `MonthCell`, not a `Transaction`, so it cannot be put in `dataset.transactions` by accident. `cellRows` makes one
  row from each (negative id, empty description, the first day of its month) and derives its status from the account
  and the statements as they are then, so toggling a statement needs no change to a cell.
- **Two lists** come out of `assembleRows`. `linear` is pinned rows, hydrated rows and the cell rows: it goes to the
  engines that only add amounts, to the list of months, and to the spending groups and their detail, which read a 12
  month trend of sums beside the rows of the viewed month. `real` is pinned and hydrated rows only: it goes to the
  engines that read dates, descriptions, labels, links or whole series, and to anything shown to the user as a
  transaction. `src/testing/engineOutputs.ts` lists which consumer gets which.

On the 80 random ledgers and on every month of the adversarial ledger, run once as a closed month and once as the
open month, these consumers give a different answer from the lists than from the whole ledger, and nothing else does:

| Consumer | Why it differs |
|---|---|
| Groups and detail by fixed or flexible, `detectedFixedCosts` | Unless handed one, they build their own classifier or recurring groups from the rows they get, and a series needs three rows and every gap |
| `computeSpendingPace` | Only `flexibleBudgetCents` and `shouldBeTodayCents`, which come from the envelope (`expectedFixedCents`), built the same way |
| `computeSignals` | While M is the open month it reads the pace |
| `buildOverviewData` | Builds the classifier from the rows it is handed and does not take one, so the allocation, movers, pace, fixed costs and signals differ. KPIs, baseline and unpaid caps match |
| `latestTransactions`, `recentlyAdded` | Global and relative to today; the window around a past M does not hold them |
| `filterTransactions` over every date | Needs any month's rows: it is read through the paged transaction reads described in [SCALING.md](./SCALING.md), not from these lists |

The first three rows go away when the engines are handed the classifier and the recurring series of the whole
history, which is tested: `computeSpendingGroups` and `computeSpendingGroupDetail` take `classifier`,
`computeSpendingPace` takes `fixedGroups`, and `expectedFixedCents` and `detectedFixedCosts` take `groups`. Build them
with `classifyFixedSpend` and `recurringFixedGroups` over every row. With none passed the engines build their own from
the rows they are given, as they always did. `buildOverviewData` and the Spending view pass the model's `history` when
it has one, so the Overview model matches too. Each difference is written down in `src/testing/intendedDifferences.ts`,
and the sweep fails both if something else differs and if a listed difference never shows up.

### How the screens read the model

`ExpenseModel` (`src/ui/useExpenseData.ts`) holds two datasets. `dataset.transactions` is the `real` list: what is
shown to the user as a transaction, and what every engine that reads dates, descriptions, labels or links is given.
`sums` is the `linear` list (the real rows and one row per cell), for the engines that only add amounts. It is absent
while the model holds every row, when `sumsOf(model)` returns `dataset` itself, so for a ledger under the size policy
every screen reads the same list as before. `history` carries the recurring series of the whole history and is set
only for a model that does not hold every row. `buildLedgerModel` (`src/ui/buildLedgerModel.ts`) makes the model from
a `Ledger`.

| Screen | Reads |
|---|---|
| Dashboard totals, budgets, card statements, Goals card | `sums` |
| Dashboard recent activity, installments, flagged, past reports, expense report | `dataset` (real rows) |
| Overview: totals, baseline, unpaid caps, cash rows | `sums` |
| Overview: allocation, movers, pace, fixed costs | `dataset`, with the classifier and series from `history` |
| Spending groups and their detail | `sums`, with the classifier from `history` |
| Monthly summary grid, monthly totals, yearly overview, cash view and table | `sums` |
| Goals: monthly flows, pace, cash reserve | `sums` |
| Goals: measured return and gap split | `dataset` |
| Settings: card statements | `sums` |
| Settings: stopped suggestions, label counts | `dataset` |
| Transactions: list, selection, search, total | `dataset` |
| Transactions: statement rows (cash reconciliation) | `sums` |
| Upcoming | `dataset` |

Three readings of `dataset` are wrong on a model that holds only a window, and are not changed here: recent activity
(the newest rows by date and by when they were added), the description index, and the counts of how many
transactions carry a label, a category or an account. The first two need rows that are not held, and the counts need
a read of their own (`GET /api/expenses/usage`). The stopped suggestions and Upcoming need the series, which the
server also serves (`GET /api/expenses/series`). None of these differs for a model that holds every row.

An investment is pinned, so it is real in every month, and the Goals pace and the balances at cost, which read only
investments, give the same answer from either list. They read `sums` anyway, since they are engines that add amounts
and that agreement rests on the pinning rule alone.

`src/ui/ledgerModelSweep.test.ts` runs the functions the views call, for every viewed month of the 60 month
adversarial ledger, with a 13 month window and the series of the whole history, closed and as the open month, and
requires them to equal the same functions over every row. It also checks that the sweep fails when the series is left
out and when the engines that add amounts are given the real rows. A second test holds a one month window to the
readings of a closed month that need no other real rows. `src/ui/ledgerModelRender.test.tsx` renders the screens
over both models and compares their text, with today in the newest month while an older month is shown.

## Reading a series

A series needs the whole history, but what the detectors read of it is small. Reading each consumer
(`recurringDetect.ts`, `recurringPredict.ts`, `recurringUpcoming.ts`, `fixedFlexible.ts`, `fixedCosts.ts`,
`spendingPace.ts`) for what it takes from an `OccurrenceGroup`:

| Read | By | Needs |
|---|---|---|
| Median gap and regularity | `fixedRhythm`, `isMonthlyGroup`, `detectUpcoming` | Every gap between consecutive dates, in any order: only their spread counts |
| Usual day | `usualDay` | The newest 3 dates |
| Lead time | `leadFromHistory` | The newest 5 dates |
| Pending date | `pendingDate` | The newest date. It also asks whether any date is within 14 days of a usual date, but an older date can only be if the newest is |
| Budget month of a suggestion | `suggestionFor` | The median of the newest 3 rows' offsets, so their order does not matter |
| Alive in a month | `activeInMonth` | Whether the series has a row booked to the month, the one before or the one before that, for any month the screen shows |
| Last month of a fixed cost | `detectedFixedCosts` | The newest budget month |
| Name, amount, account, category, type | every consumer | The newest row |

So a series is carried as the newest 5 dates, the gaps before them, every distinct budget month, 3 offsets and
the newest row (`RecurringSeries`). The budget months are the part the earlier proposal of "every gap and the
newest 5 dates" left out: `activeInMonth` is asked about the viewed month, which can be years back, so the
newest few cannot answer it. They cost one short string per month a series was booked in. The dates before
the newest 5 are known only by their gaps, which is all anything reads: the group built back from a series
has the right gaps in those places and not the day each one fell on. A series of 5 or fewer rows has no
older gaps. Each of these is needed: the consumer tests (`seriesConsumers.parity.test.ts`) fail if the tail
is cut to 3 or 4 dates, the budget months to the newest 3, one older gap dropped, or the offsets to one.

The one input that is not part of a served series is a stopped series with fewer than three rows left.
`stillStopped` knows the newest charge of any series key it is given, including a series too short to be a
series, and the served series list only series of three or more. For a stopped series that has since fallen
below three rows, whose newest charge is newer than the one it was stopped at and is not among the rows the
browser holds, `stillStopped` still counts it as stopped. A series is only offered to be stopped when it has
three rows, so this needs the owner to have deleted rows afterwards.

## Properties worth knowing

**Recurring detection and the fixed or flexible split**

- A series needs three rows. They are rows, not distinct dates (`MIN_OCCURRENCES` in `recurringDetect.ts`). Tested.
- A yearly series has gaps of 340 to 395 days (`classifyFrequency`), so three yearly rows span 680 to 790 days, 22 to
  26 months. Tested at 340, 395, 339 and 396.
- Only the fixed or flexible split and the fixed cost list act on a yearly series. `detectUpcoming` returns nothing for
  one and the pace envelope takes monthly series only. Tested.
- The median and the regularity are taken over every gap of the series, so a shorter history can classify the same
  series differently. A row is also classified by rows dated after it. Tested.
- So no window of history gives the same split. On the 60 month ledger it matches only once the window reaches the
  start of the ledger, and for a closed month only with the rows after M too. Tested.

**Portfolio return and gap split**

- Both read investment rows by exact date and sign: dropping an old row, dropping a withdrawal, moving a row to the
  first of its month, or moving a row one day across a check-in each change the return. Tested.
- `portfolioReturn` starts at the first check-in, not the first one with money, and a flow in an empty stretch makes
  the result null.
- `splitGap` starts at the first check-in on or after the plan start. It also matches flows to plan events from the
  plan start less 45 days to the newest row (`EVENT_MATCH_DAYS`).

**Cash reserve**

- It averages the 12 newest months that have spend, which can span more than 12 calendar months: 12 spending months
  spread over 18 in the test, and a 12 calendar month window gives a different average. Tested.
- It is relative to T, not M. A month whose net expense is exactly zero is skipped, and forecast rows are not counted.

**Engines that only add amounts**

`computeMonthlyTotals`, `computeCategoryActuals`, `computeYearlyOverview`, `computeCashReconciliation`,
`balancesAtCost`, `buildStatementPayments` amounts, the Goals flows, `averageMonthlySpendCents` and
`computeSpendingBaseline` give the same output from summed cells. Tested for three viewed months with no real rows.
Two properties come with that:

- `computeYearlyOverview` and `computeCashReconciliation` are running totals from the opening balance, so they need the
  sum of every earlier month, not a window.
- A month exists for the Goals pace as soon as it has a counted row, so a cell whose sum is zero must still exist.

`computeOverviewKpis` is linear only for a closed M. While M is the open month, M and the months it is compared with
are cut by date, so those months need their rows. Tested, including a previous month with one row before the cut and
one after.

## Where a bound changes the output

| Engine | Why | Constant to read it with |
|---|---|---|
| Fixed or flexible split, recurring detection, Upcoming (`classifyFixedSpend`, `recurringFixedGroups`, `detectedFixedCosts`, `detectUpcoming`, `stillStopped`) | The median and regularity run over every gap, three rows make a series, and later rows reclassify earlier ones | `SERIES_TAIL_DATES = 5` (`recurringSeries.ts`, the larger of `PREDICT_HISTORY` = 3 and `WINDOW_HISTORY` = 5): per series key, the newest 5 dates, every older gap, every distinct budget month, the newest 3 budget offsets and the newest row (see [Reading a series](#reading-a-series)). No history bound: a cap would have to cover three yearly charges at 395 days, about 39 months, and would still reclassify long series |
| `averageMonthlySpendCents`, `cashReserve` | 12 months with spend, not 12 calendar months | `CASH_RESERVE_SPEND_MONTHS = 12` (exists), applied to month sums as the 12 newest months with a non-zero net expense before the open month |
| `computeSpendingBaseline` | 12 months with data | `BASELINE_MONTHS = 12` (exists), counted in months with data |
| `computeOverviewKpis`, `computeMovers`, `computeSpendingPace`, `computeSpendingGroups`, `computeSpendingGroupDetail`, `computeAllocation` | The same-days cut and the per-row reads reach 12 months back, and further across a gap | `HYDRATED_DATA_MONTHS = 13` (`src/domain/ledger/hydration.ts`): the 13 newest months with data up to and including M. Tested with and without a gap; 12 is one short for the year-ago baseline |
| `portfolioReturn`, `readReturn`, `splitGap` | Exact dates and signs from the first check-in; plan events matched within 45 days | None: keep every investment row. If a bound is ever wanted, the first check-in, or the plan start less `EVENT_MATCH_DAYS = 45` |
| `latestTransactions`, `recentlyAdded` | Global, relative to T | `RECENT_ACTIVITY_LIMIT = 8` (exists as `LIMIT` in `transactions.ts`), served as a top-N by date and by `createdAt` |
| `computeYearlyOverview`, `computeCashReconciliation`, `balancesAtCost` | Running totals from the opening balances | None: the summed months from the first month are the bound |

## What follows for a bounded read

1. Hydrate by months with data, not by calendar. A calendar window of M-13 to M is one month more than the readers
   need when there is no gap and too short across one. 13 months with data is exact (tested).
2. The classifier is the larger dependency. Movers, pace, allocation, fixed or flexible groups, group detail and
   fixed costs need the series as well as the rows. Four of them build their own classifier or groups from the rows
   they are handed (`computeSpendingGroups`, `computeSpendingGroupDetail`, `expectedFixedCents` and
   `detectedFixedCosts`). Left to build their own, three answer differently on a window (tested), and the pace
   envelope matched only because every monthly series on the generated ledger has three rows inside it. Each takes
   the classifier or series of the whole history as an optional argument, and with it a window matches (tested).
   The server holds that history: `GET /api/expenses/series` returns every series in the shape of
   `RecurringSeries`, and `classifierFromGroups(recurringFixedGroupsFromSeries(series))` and
   `recurringFixedGroupsFromSeries(series)` are the classifier and groups to pass. Upcoming charges
   (`detectUpcoming`) take `groups` the same way, and `stillStopped` takes the series' newest charges
   (`newestChargesOfSeries`). The result is tested to match the answer over every row.
3. The same-days cut reaches the months a month is compared with, so while M is the open month the 12 months back
   need dates. A closed month does not.
4. Recent activity is relative to today and global. The window around a past M never contains it.
5. The Transactions list filters 3 months and custom ranges by calendar date, and a row dated 31 March can belong to
   April. Those scopes have to be read by date, not mapped onto budget months.
6. Keep a cell for cancelled rows and for sums of zero: `months` includes cancelled-only months and the Goals pace
   counts a month from its first counted row.
7. Pinned rows need the payments that settled rows (`reportCount`) and the labels on settled rows (`settledFlagId`
   reads them). Unpinned, the portfolio return, gap split, flagged groups, past reports and plan progress all change
   (tested). Summed cells must leave pinned rows out, or investments are counted twice.
8. Row counts matter in a few places and have to come from real or pinned rows: the three row floor for a series, the
   Spending `txnCount`, plan progress and the Transactions list's match count.

This is measured on one generated ledger, so a window found by scanning (11 for label rows, say) belongs to that
generator. The structural results do not: the cut reaching a year back, three rows for a series, windows counted in
months with data, and everything pinned or summed.
