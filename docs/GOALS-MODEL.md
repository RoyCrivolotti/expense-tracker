# Goals projection model

Year-by-year wealth projection for the Goals tab. Canonical personal assumptions
live in a private workbook repo; the public app reads saved scenarios
from D1 only.

## Overview

The Goals tab has three views:

- **Plan** — projection lab. Configure scenarios, compare alternatives, see the hero net-worth chart with return bands and life-event markers. The hero has 5Y/10Y/20Y/All windows that cut everything drawn at the same year, and its legend rows hide or show a saved scenario's line (the same state as the chip's eye on a phone); a table under it puts the scenarios side by side as numbers. On a wide screen Plan is one column: a tab per scenario with a menu for what can be done with the open one, the hero across the page, a bar of up to five inputs beside the net worth they move (monthly investing, real return, horizon, purchase year and starting balance until the owner chooses others: `DEFAULT_LEVERS` in `engine/goalLevers.ts`, stored per owner in `settings.goalLevers`), the remaining inputs under an "All inputs" button, and the detail charts in two columns.
- **Progress** — wealth tracking. Log actual balances per account, see on/off-track status against your plan, and compare actuals to the projection over time.
- **Assumptions** — what Progress measures with: the milestone ladder, the wealth accounts each check-in records a balance for, the cash reserve target in months of spending, and the assumed inflation every Goals view uses.

Below 900px wide the switch is one row of four segments, Chart, Progress, Scenarios and Assumptions, because Plan is two screens there: Chart holds the hero chart, the snapshot, the scenarios and the detail charts, and Scenarios keeps the snapshot and the scenarios, and puts the controls under a pinned chart of the draft.

### The plan

One saved scenario per owner is *the plan*: `goal_scenarios.is_active`, set with **Use as my plan** in the scenario editor and enforced by a partial unique index so an owner can never have two. Progress, the dashboard Goals card and every check-in delta measure against it. The editor's selection is a different thing: loading another scenario to explore it does not change what you are measured against. An owner's first scenario becomes the plan on creation; deleting the plan leaves none until another is chosen.

Two questions, two sources. *How far along am I* is a balance and comes from check-ins, which capture market value however the money arrived. *Am I keeping the pace* is a flow and comes from the `investment` transactions put in per month since the plan's start date, withdrawals left out (`monthlyFlows` and `paceMonths` in `engine/goals.ts`), compared with what the plan invests each month on the dashboard card, in the "Actual investing vs plan" chart and on the Progress snapshot, both as what leaves the account, so the two sides are in the same money. For a plan that never changes its monthly amount that is the one figure; for one that changes it from a date it is the plan's average over the same months (`plannedMonthlyAverage`), with where it started and where it is now beside it, and the chart draws it month by month as a line of its own instead of a flat one. `paceMonths` picks the months: the budget month still under way is left out (someone who invests on the 25th is not 167 short on the 24th), a month inside the record with no transactions counts as a month of nothing invested, months before the first one recorded are unknown and not counted, and a plan that started after the last whole month has no pace yet. The sentence says "since the plan started" only when the months do start there, and "recorded" otherwise. Within 2% of the plan's figure is on pace. The snapshot reads the mean, which is the pace, and names the median beside it as a typical month when the two are more than a tenth apart (`medianMonthlyCents`): a lump sum such as the proceeds of a sale sits in the mean for every month after it, and the median says what the months around it look like without a threshold for what counts as an outlier. Net saving is drawn beside it for context only; the gap between the two is money that stayed in the current account. A one-off inflow belongs in the plan as a life event or a re-baseline, not in the monthly average.

A third question, *is being behind a saving problem or a market one*, is the measured return on the Progress snapshot (`portfolioReturn` in `engine/portfolioReturn.ts`). It is a linked Modified Dietz: each stretch between two consecutive check-ins gets its own return, the end balance less the start balance less the net flows, over the start balance plus each flow weighted by the share of the stretch it was in for, and the stretches are chained. That is the standard approximation of a time-weighted return, the same kind of figure as the plan's expected rate, and it gets closer to the true one the more often check-ins are logged. Flows are `investment` transactions: positive going in, negative coming back out, which is how a sale to cash or a dividend paid out is recorded (the form calls it Withdraw). A check-in is the balance at the end of its day, so a flow dated a check-in belongs to the stretch that ends there. The figure reads "so far" under a year and as a yearly rate from a year on. From a year on it is set against the plan's real return: the plan is real, so the measured return has the assumed inflation taken off first, `(1 + r) / (1 + inflation) - 1`, the same way on/off track deflates a balance before comparing it with the plan line, and a portfolio that returned the plan's real rate plus inflation reads as on par. Under a year the plan is stated for the same days instead, `((1 + real return) x (1 + inflation)) ^ (days / 365.25) - 1`, because a total over weeks beside a yearly rate reads as ahead whatever the plan expects. A yearly return is coloured against the plan's only from ten years of history: at 17% volatility its standard error is about 12 points after two years and 5 after ten, so a shorter one is shown plain with a sentence saying so. It is null with fewer than two check-ins thirty days apart, and when a stretch starts at nothing yet ends with money that no transaction accounts for.

A gap that holds still is the plan's starting point, not the saving, so the snapshot offers a re-baseline (`steadyGap` in `engine/steadyGap.ts`) when the check-ins reaching back at least 180 days number three or more, all sit on the same side of the plan, their spread from smallest to largest gap is within a quarter of the mean gap, and that mean is worth at least three months of what the plan invests at the latest check-in (`plannedMonthlyAt`; during a pause that is nothing, and it says nothing). Below that it is on-plan noise and stays quiet. The button writes the plan's start to the latest check-in and patches the editor's draft of the same plan, so Plan does not then offer to save the old start back.

A re-baseline is not needed to see what being ahead or behind does to the years ahead. The plan as it stands from the latest check-in (`planFromToday` in `engine/planFromToday.ts`) is the same restart, derived and never saved: the plan's assumptions projected from the check-in's balance and date, with the life events and the house purchase kept on their calendar dates and the monthly amount in force at the check-in, exactly what `rebaseline` would write. It is drawn on the hero chart as a dotted line in the plan's colour from the check-in's place on the plan's axis (a point series, since it starts at a fractional year; `pointSeriesValueAt` reads it at a whole year for the legend and the tooltip), carried to the last year of the axis or window along the step it is cut from, so the legend has a figure there (before the check-in the row shows a dash), listed under the plan in the comparison and milestone tables (the milestone tables count it from today like every other row), dated beside the plan's own date for each unreached milestone on Progress, and carried as a second FI year on the dashboard card. The plan line stays as it was, so ahead or behind, the months-behind figure and the steady-gap hint keep their baseline.

### The levers bar

`settings.goalLevers` (`goal_levers`, a JSON array of scenario input names such as `expectedRealReturn`) is the list of inputs the wide Goals page keeps in its bar, in the order shown. Null (never chosen) reads as the five in `DEFAULT_LEVERS`; an empty array is a deliberate empty bar. At most five (`MAX_LEVERS`), no repeats, and only the fourteen numeric inputs in `LEVER_KEYS` (the plan start date and the life events are not dials); the API and the in-memory repository both refuse anything else (`leversError`), and a stored list is read back with unknown names dropped (`parseLevers`). An input in the bar is left out of the "All inputs" panel, and the phone, which has no bar, shows every input as before.

## Money and terms

Every euro the planner shows is in one of two moneys, and each input says which one it is typed in. The sections below rely on these meanings.

| Term | Meaning |
|---|---|
| Real money | Euros at the plan's start date, the plan's own ruler. A year passing does not move it; only restarting the plan from a later date does (a re-baseline). |
| Screen money | Euros on the account on a future date: screen = real x (1 + inflation)^years. |
| Assumed inflation | One rate for the owner (`settings.assumed_inflation`), used for every conversion, also for years already gone. |
| Return | A real return, after inflation: the typical yearly growth the plan compounds at. |
| Typed in real money | Spending at FI, house price, rent, purchase fees, life-event amounts. The plan keeps them constant in real terms, so on the account they rise with prices. |
| Typed in screen euros | The monthly investing amount and its changes (flat euros as sent, brought back to real money by the engine), the mortgage payment (fixed by the loan), check-in balances. |
| Invested | The portfolio you invest in, without the house. Milestones and FI are measured against it. |
| Net worth | Invested plus the house's value minus the loan. |
| Plan start | `planStartDate`. Its anniversaries carry the house purchase and life events: plan year N is N years after it. |

A made-up plan is used wherever an example is needed (`src/testing/samplePlan.ts`): 50.000 € now, 1.000 € a month, 5% a year after inflation and 2% inflation, started 1 January 2026 over 30 years, a 300.000 € house bought in year 8 (20% down, 6.000 € fees, a 25-year loan at 3%, prices up 3% a year), 1.000 € rent, 30.000 € a year to live on at a 4% withdrawal rate. In it, 30.000 € a year of 2026 prices costs 36.570 € on the account in 2036 (30.000 x 1,02^10).

## Return and contributions

| Parameter | Default |
| --- | --- |
| Real return, a new plan | 5% / year (`DEFAULT_REAL_RETURN`), about what world stocks returned over the very long run after inflation; an existing plan keeps its own |
| Real return, the demo scenarios | 7% / year |
| Net retention (salary model) | 65% of gross — **engine helper only** (`annualSavingsFromCashflow`); charts use explicit `monthlyContributionCents` |

The monthly amount is what the scenario starts with, `monthlyContributionCents`, and stays that until a change from a date says otherwise (below). There is no yearly raise: a rise is a dated change, which says the month and the amount.

The amount is what leaves the account, not today's money. Each year's payments are added at the end of that year and earn nothing until the next one, which is a little cautious against paying every month (about 3% lower after thirty years at 7% when the balance is all payments, less when there is a starting balance); it is the convention the plan keeps, and the glossary says so. The projection is in today's money, so each year's payments are brought back to the money of the plan start by the assumed inflation (`annualContributionCents`): a payment `t` years after the start counts as `(1 + inflation)^-t` of itself, and a year of a constant `m` a month counts as `12 × m × ((1 + inflation)^-(y-1) - (1 + inflation)^-y) / ln(1 + inflation)`. An amount that stays the same therefore counts for less every year, which is what leaving it alone does to its buying power; a plan that wants its payments to keep pace with prices has to say so with changes. With no inflation the year is just `12 × m`.

### Changing the monthly amount from a date

`goal_scenarios.contribution_schedule` (`GoalScenario.contributionSchedule`, a JSON array of `{ from: 'YYYY-MM', monthlyCents }` in date order, at most thirty) says "from the first of this month the scenario invests exactly this much a month". Before the first step the scenario is exactly as it was, so a scenario with no schedule produces the same figures as before, to the cent. A step is an absolute replacement, not an increment: from its month the amount is exactly `X` until the next step, and 0 is a pause. Amounts are what leaves the account, like the base. Steps need `planStartDate`: it is what gives a plan year a date to start on, and without one no step applies. A step at or before the plan start is read as the amount the plan starts with, which is how a scenario whose start was moved past a step still projects. The editor lists them under "Monthly investing over time" (`ContributionStepsList`, between Plan start and Life events, folded on a phone) as a history: the amount the scenario starts with on the plan's start date first, then each change, which can be added, edited in place or removed. A change's month comes from the month picker, which will not let it start on or before the plan's own month (the starting amount is edited where every other input is, in the levers bar or under Portfolio, and the line under the list says which), nor repeat, at most thirty, and there is nothing to add or edit without a plan start. A pause shows as "pause". The monthly input keeps editing the amount the scenario starts with and says, under it and in the levers bar, that it changes later (`firstChangeNote`); it stays a number among the levers because levers are the numeric inputs of a scenario.

The projection is linear in contributions, so a schedule needs no new algorithm: plan year `y` covers offsets `y − 1` to `y` counted from the plan start by the calendar (`yearsBetween`: whole anniversaries, then the fraction of the year), and it contributes twelve times the monthly amount averaged over that span by the share of it each amount was in force for, each share discounted to the plan start as above (`annualContributionCents` in `engine/contributionSchedule.ts`, from steps put on the plan's axis by `scheduleSteps`). The rate only changes at a step, so the year is cut there and each piece read at its middle. A step on a year boundary changes the year it starts; one part way through weights the two amounts by days, so a step from 1 March into a plan that began on 1 January gives that year 59/365 of the old amount and the rest of the new one. With no inflation the closed form for a step of `Δ` a month first affecting plan year `t0` is that it adds `12 × Δ × ((1 + r)^(y − t0 + 1) − 1) / r` to year `y`, which the tests check, because contributions earn no return in the year they are made; with inflation each year's `12 × Δ` is discounted first.

## Housing

| Parameter | Default (demo) |
| --- | --- |
| House price | User input / saved scenario (today's price; the plan buys at the price it has risen to) |
| Down payment | 20% |
| Transaction costs | €500 |
| House appreciation | 2.5% / year |
| Mortgage | 3% × 30 years |
| Rent (when not owning) | €1,200 / month |
| Home carry (rent vs buy) | 1.5% / year of home value (maintenance + tax + insurance; engine default, not yet a UI control) |

`housePurchaseYear`: `null` = never buy; `0` = owned from day one (capital already
allocated); `N > 0` = buy after year N (withdraw down payment + costs that year).

The withdrawal is not limited to what the portfolio holds. When it cannot cover the purchase, or a
life event that costs more than it holds, the invested balance goes negative and then compounds at
the plan's return, a debt no lender offers, so every figure from that year on describes a plan
nobody could follow. `portfolioShortfall` (`engine/portfolioShortfall.ts`) names the first year the
balance is below zero and whether the house alone (the down payment and the costs against what the
portfolio holds before them) or a life event put it there, and `PortfolioShortfallNote` says so
under the hero chart. The projection itself is unchanged: the note is the guard, not a clamp, since
the right fix (a later year, less down, more invested) is the reader's to choose.

## Rent vs buy

Symmetric **net worth** comparison via `projectRentVsBuy` (`src/domain/engine/rentVsBuy.ts`):

- **Rent & invest:** starts with down payment + transaction costs in a side portfolio; each year invests the surplus when rent + invested cash beats buyer outlay.
- **Buy now:** equity (appreciation − mortgage) plus any side portfolio when buying costs less than renting.

The verdict (`rentVsBuyVerdict`) names who leads over the horizon and from when. Buying can lead for the first years (the renter pays the purchase costs first, and the owner's equity grows with the repayments) and then fall behind for good, so the first year it draws level is not called a breakeven. `breakevenYear` is the year buying gets ahead and stays ahead to the end, and null when it does not. Simplifications: constant rent, fixed carry rate (1.5%/yr default, not yet a UI control), no selling costs or transaction friction on resale, so the buyer's figure is before the costs of selling.

## Net worth over time

The Progress history chart joins the check-ins on a calendar axis ending today: total net worth (debts subtracted) and the invested balance. Once any check-in carries a balance against a debt-kind account, a third line, assets (everything owned, debts left out), joins them, so a mortgage taken on in one month reads as a loan rather than as a loss of net worth. Without debt the two would coincide, so it stays off.

## Cash reserve

`settings.cashReserveMonths` (`cash_reserve_months`, 0 = no target) is the emergency-fund target in months of spending, set under the Goals tab's Assumptions view. Progress takes the live cash-kind accounts with a balance in the latest check-in and divides by the mean expenses of the last twelve completed budget months that recorded any (`cashReserve` in `engine/cashReserve.ts`), and says how many months they cover, against the target when there is one. With no such balance the line stays off rather than reading as zero. It never enters the invested-only tracking above.

## Milestones

Per-owner list of named net-worth targets, measured against the **invested portfolio only**. Edited from the Goals tab's Assumptions view and stored as JSON in `settings.milestones`; up to 12 entries, each with an optional name and an optional target date (`targetDate`, YYYY-MM-DD). With a target date, Progress dates the plan's crossing of the amount (`milestoneCrossingDate`, interpolated inside the crossing year from the plan start) and says on track or late; without one it shows the expected date alone. Once the plan's own date has passed with no check-in reaching the amount it says not reached yet, whatever the target, since from then on the check-ins have the say. A check-in at or above the amount counts as reached whatever the plan says.

A named milestone is always shown with its amount, since the name alone does not say how far away the target is. In prose that reads "House deposit (100k €)" (`milestoneLabelWithAmount`); in the years-to-milestone matrix the two are stacked on separate header lines, with the full name and reached date in the header's tooltip because columns are narrow. An unnamed milestone shows only its amount.

A path's own figure for a milestone is the whole-year step at which its invested portfolio first reaches it, counted from the path's start (`MilestoneRow.sinceStart`; null: not within the path's own horizon). It can therefore be up to a year later than the interpolated date Progress shows. The matrix shows every row on one footing, whole years from today (`yearsFromNow` in `charts/milestoneModel.ts`): the own figure less the years between the path's start and today (`yearsBetween`, to the day), rounded up. Rounding up is deliberate: the figure is the first yearly step at or above the amount, so the true date is within the year before it, and "within N years" is the claim that holds. A path that started under a year ago therefore shows its own figure unchanged, and one that started long ago shows a smaller number. 0 is already there: the path had the amount at its start, or its own step is already behind today (the sentence then says it reached it before today, in that calendar year). Not within the horizon is written as the years left to the end of the horizon (`horizonFromNow`, at least 1) with a plus. The start is the scenario's plan start date, today when it has none, and the latest check-in's date for the plan from today. "Calendar year" is the exact-by-year view: the start year plus the own figure, so it does not move with today. "vs plan" sets every row except the plan itself, including the plan from today, against the scenario marked as the current plan, in years, as the difference of the two figures shown (so it never disagrees with the cells on screen); where only one side never gets there it says "sooner" or "later". The tint scale runs to the longest `horizonFromNow` among the rows.

The timeline view of the same card places each path's milestones on one axis of years that starts today ("now", with the calendar year underneath). A milestone sits at the cell's years from today, so a path that started long ago starts at "now" like the rest and its dots are where the table's cells say; a path that starts later starts that many years along. The calendar year in a dot's sentence is still the path's own step. Milestones a path has already, or that a check-in reached, collapse into a badge at the left edge; with every milestone reached by check-ins only the ones already there on the path's own terms do, since the check-ins no longer tell them apart. Milestones not within the horizon collapse into a badge past the end of the path, and a path with a shorter horizon than the longest ends in hatching.

Owners who have never customised the list get the built-in ladder: €100k, €200k, €300k, €400k, €500k, €750k, €1M. That is a fallback for a `NULL` column, not a floor — an empty list is a valid choice and leaves the matrix and chart reference lines empty.

A milestone counts as **reached** once any wealth check-in recorded an invested value at or above it. The date shown is that check-in's date, so it is "reached by", not "reached on" — the actual crossing happened somewhere between two check-ins. Reached milestones stay reached even if the portfolio later falls back below them.

Chart reference lines are capped relative to the projection's own ceiling. A milestone far above what the plan reaches is left off the chart rather than compressing the projection into a sliver at the bottom; it still appears in the matrix. The FI target follows the same rule in every window, All included: a reference line sets the axis, so a target well above the plan is left off the axis and marked on the chart's top edge with an arrow and its amount (`ChartAboveMarker`).

## Financial independence and withdrawal

Safe withdrawal rate defaults to 4% (25× annual spend). Adjustable per scenario.

The FI year is the year the **invested portfolio** reaches the target (`yearsToFi` in `projection.ts`), not the net worth: a withdrawal rate draws on what can be sold and spent, and a house is not that. It is the same measure the milestones use, so a plan with a house cannot show "FI in year 0" beside a milestone of the same amount ten years off. The FI drawdown chart starts from the portfolio in the FI year for the same reason.

## Life events

One-off cash flows applied to the invested portfolio in a specific projection year:

```ts
interface LifeEvent {
  year: number        // projection year (0 = year zero / initial balance)
  amountCents: number // positive = inflow, negative = outflow
  label: string       // short description, e.g. "Inheritance", "Car purchase"
}
```

Stored as a JSON column (`life_events`) on `goal_scenarios`. Applied in the yearly loop after growth, contributions and the house purchase withdrawal. They are all added to the year's balance, so the balance at the end of a year does not depend on their order. Year 0 is the initial balance — events at year 0 are not applied by the engine and not accepted by the UI (minimum year is 1). Rendered as diamond markers on the hero chart (green for inflows, amber for outflows).

## Return bands

The hero chart shows a shaded band for ±3 pp around the scenario's `expectedRealReturn`. It is a sensitivity to the return, not a range of likely outcomes: it carries no probability, and the same plan with the return three points either side is what it draws. Computed by `projectNetWorthBand` in `scenarioProjection.ts`. The band uses the same contribution and housing logic as the main projection. Chart layer: `kind: 'band'` on `ChartSeries`, rendered by `ChartBandLayer` in `linearChartParts.tsx`. The band is context, not the thing being read, so it does not set the chart's axis: `LinearChart` fits the axis to the lines and clips a band that runs higher at the top of the plot. Otherwise a wide band at thirty years would leave the lines under a ceiling twice their height.

## Real, and the nominal view

The plan is real: the return is a real return, so every projected figure, the FI target, the constant rent and withdrawal, the milestones and the comparison table are in today's money. The one input that is not is the monthly amount, which is entered as what leaves the account and brought back to today's money by the assumed inflation (see Return and contributions). Check-ins are broker balances in the money of their day, so wherever Progress sets one against the plan (`trackStatus`, the "Actual vs plan" chart, the measured return) the balance is deflated first, by the assumed inflation over the years since the plan start. Milestones reached are the exception: a milestone counts as reached when a check-in shows the number, in the money of that day.

The hero chart shows the plan in today's money by default. Its footer toggle switches to a nominal view, which inflates the plan line and its band by the assumed inflation, and leaves the check-in dots as they are, since they are already nominal:

```
nominal[y] = real[y] × (1 + rate)^y
```

In the default view the dots are deflated by their own fractional year offset (`xIndex`) instead, so an actual exactly on plan sits on the line either way (`inflateSeries`, `deflatePoints` and `computeChartDisplayData` in `nominalTransform.ts`).

The FI target and the milestones are targets in today's money and a reference line is flat, so the nominal view does not draw them, and says so beside the toggle. On Progress, "Actual vs plan" says it is in today's money, and "Net worth over time" says its balances are as logged, in the money of each day.

### The assumed inflation

There is one rate, and it is the owner's: `settings.assumed_inflation` (`ExpenseSettings.assumedInflation`), read as 2% (`DEFAULT_INFLATION_RATE`, about the ECB target) until it is set, and held between 0 and 10% (`INFLATION_MIN` and `INFLATION_MAX`, checked by the one `assumedInflationError` the API, the in-memory double and the control share). It is set in Assumptions, beside the cash reserve target and the other assumptions Progress is measured with, and nowhere else: `useSavedInflation` keeps the newest step while a save is in flight and puts the saved value back if it fails. The Nominal view can be looked at under another rate without saving one (`NominalPreview`, `NetWorthChart`'s `viewInflation`). The plan line, its band and the plan from today are projected again at that rate and inflated by it, because the monthly amount is euros as sent: the real line itself depends on the inflation it is brought back by, so the saved line drawn higher would not be the plan at the other rate (`previewing`, `projectionRate` in `NetWorthChart`; a preview of 6% over a saved 2% draws exactly what a saved 6% draws). The dots and everything beside the chart stay at the saved rate, so trying a rate cannot make Progress and the dashboard disagree with each other, and the preview is dropped when the view, the Nominal mode or the tab is left. The Y axis keeps the height the saved rate gives the Nominal view's lines (`useSavedRateFloor` projects them at the saved rate for that), so a lower rate visibly lowers the plan; `LinearChart` treats that height as a floor and never clips a line, so a higher rate grows the axis once the line no longer fits. Only Nominal holds a floor: Purchasing power fits its own plan, so switching views rescales the chart rather than leaving today's money under the nominal plan's height. It is not offered in Purchasing power, where the plan is already in today's money and the rate only decides how check-ins, the house and the mortgage are brought back to it, which is the saved rate's job. It is a setting of the owner rather than of a scenario so that every scenario, and every row of the comparison table, is in the same money.

Everything that meets a nominal figure takes it: the on/off-track line, "Where you are today", the check-in dots in today's money, "Actual vs plan", the measured return, the house and the mortgage below, and the nominal view. The engine takes it as an argument and has no default of its own: `ProjectionParams.inflationRate` is required, `scenarioToParams(scenario, inflationRate)` takes it, and so do `trackStatus`, `planValueAtDate`, `nominalToReal`, `steadyGap` and the milestone outlook. Components read it with `useAssumedInflation()`, provided once from the settings, and pure helpers are handed it. The chart has no rate of its own, so it cannot disagree with the status beside it. A cached offline snapshot from before the field existed is discarded (`SNAPSHOT_VERSION`), since every projection reads it.

### The house and the mortgage

The house price is entered as today's price, in the plan's money. Appreciation and the mortgage rate are entered nominal, the way prices and banks quote them, and the engine takes inflation off both. A house bought in year `Y` costs `housePrice × ((1 + appreciation) / (1 + inflation))^Y` on the day (`housePriceAtPurchaseCents` in `housePrice.ts`), because it has had `Y` years to rise by what it beats inflation by. The down payment, the loan, the withdrawal from the portfolio and the payment all follow that price, and the house is then worth it grown by the same factor each year from the purchase year, which is today's price grown the whole way. Nothing changes for a house already owned (year 0) or not bought. The mortgage balance follows the bank's fixed schedule and is then divided by `(1 + inflation)^(years since purchase)`, and the mortgage balance follows the bank's fixed schedule and is then divided by `(1 + inflation)^(years since purchase)`, as is the payment set against rent in the rent-vs-buy comparison (`houseEquityAtYear` and `mortgageBalanceAtYear` in `projection.ts`, `projectRentVsBuy` in `rentVsBuy.ts`). Treating both as real instead overstated net worth: a 400,000 house bought with a 3% 30-year loan was worth about 99,000 more after fifteen years than it is now.

## Engine formula

Each year `y = 1…N`:

```
contribution[y] = monthlyContributionCents × 12 × discount(y)   // or the schedule's average over year y, each part discounted; discount(y) = ((1 + inflation)^-(y-1) - (1 + inflation)^-y) / ln(1 + inflation)
invested[y] = invested[y-1] × (1 + expectedReturn) + contribution[y] + lifeEventImpact(y)
```

At `housePurchaseYear > 0`, after return and contribution that year:

```
invested[y] -= downPayment + transactionCosts
```

House equity after purchase: `housePrice × ((1 + appreciation) / (1 + inflation))^year`, the price entered today grown to that year in the plan's money. The down payment is a fraction of the price at purchase, `housePrice × ((1 + appreciation) / (1 + inflation))^housePurchaseYear`.

Net worth = invested + house equity − mortgage balance.

## Wealth check-ins and time anchoring

### Plan start date

`goal_scenarios.plan_start_date` (ISO date, editable per scenario) anchors the projection to the calendar. Re-baselining (from the editor, or from the Progress snapshot's button, which asks first) sets it and `start_invested_cents` from the latest check-in and moves life events and the house purchase year by the whole years the start moved (`rebaseline` in `engine/rebaselinePatch.ts`), dropping an event now behind the new start, since its money is already in the balance the plan restarts from. A plan that changes its monthly amount from a date restarts from the amount in force at the check-in, drops the changes behind the new start (they are in that amount now) and keeps the ones still to come on their own months, which count from the new start by themselves. Used by:

- `yearOffsetFromDate(planStartDate, date)` — converts a calendar date to a fractional projection-year offset.
- `planValueAtOffset(scenario, offset)` — interpolates the projected invested value at a fractional year offset.
- `planValueAtDate(scenario, date)` — wraps the above with a calendar date.
- `trackStatus(checkin, scenario, accounts)` — compares actual invested balance to plan projection at check-in date; returns delta in cents, and how many months along the plan's line the balance is ahead or behind.

### Wealth accounts

Named accounts for tracking net-worth components by market value:

| Kind | Description |
|---|---|
| `investment` | Brokerage / ETF portfolios (used for on-track comparison) |
| `cash` | Savings accounts, interest-bearing cash |
| `other_asset` | Non-liquid assets |
| `debt` | Liabilities (reduces net worth) |

Accounts can be archived (soft-delete) when check-in history exists, or hard-deleted when unused.

### Check-in structure

```
wealth_checkins: id, owner, checkin_date, note, created_at
wealth_checkin_entries: checkin_id, account_id, value_cents
```

- `checkinInvestedCents(checkin, accounts)` — sums `investment`-kind entries; compared to the projected `investedCents` for on/off-track status.
- `checkinNetWorthCents(checkin, accounts)` — sums all entries (debts subtracted), for net-worth display.
- `latestCheckin(checkins)` — most recent checkin by date.

### On/off-track delta

`trackStatus` returns:

```ts
{
  deltaCents: number         // actual invested − plan invested (positive = ahead)
  deltaMonths: number | null // whole months from the check-in to the point on the plan's line that has the balance
  planDate: string | null    // the day the line has it
  planCents: number          // what the plan projected at this date
}
```

`deltaMonths` is read along the plan's line (`planDistance` in `engine/planDistance.ts`), the horizontal gap on the chart. Dividing the gap in money by the monthly amount instead ignored what the portfolio earns by itself, so a gap read as more months than the line showed, and it jumped on the day the monthly amount changed and had no answer during a pause. The line is the one the hero chart draws, straight segments between the year points (`planValueAtOffset`), so a check-in sits where the chart shows it; a change part way through a year therefore shows as a gentler slope across that year, and the difference from the exact path is under three months of the change. The line is not always rising (a house purchase takes money out), so the point is the nearest one in the direction of the gap: ahead looks for the first time the line gets to the balance, behind for the last time it was at it. During a pause the line still rises with the return, so a pause has a distance. It is null before the plan starts, past its last year, for a balance the line never has (above where it ends, or below where it started, as after taking the down payment out early); the gap in money is always given, and the dashboard badge says it in money when there are no months. Past two years the months turn into "more than N years".

Displayed in `WealthSummaryCard` (Progress view) and `GoalsCard` (dashboard badge), both against the plan (`activePlan` in `scenarioSelection.ts`), never against whatever the editor has loaded.

## Seeding personal scenarios

Copy [`config/goal-scenarios.seed.example.json`](../config/goal-scenarios.seed.example.json)
to gitignored `config/goal-scenarios.seed.json`, or maintain
`config/goal-scenarios.seed.json` in that private repo, then run
`scripts/seed-scenarios.ts`. Keep seed JSON gitignored; review history hygiene before open-sourcing.
