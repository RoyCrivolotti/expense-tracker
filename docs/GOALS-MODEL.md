# Goals projection model

Year-by-year wealth projection for the Goals tab. Canonical personal assumptions
live in a private workbook repo; the public app reads saved scenarios
from D1 only.

## Overview

The Goals tab has three views:

- **Plan** — projection lab. Configure scenarios, compare alternatives, see the hero net-worth chart with uncertainty bands and life-event markers. The hero has 5Y/10Y/20Y/All windows that cut everything drawn at the same year, and its legend rows hide or show a saved scenario's line (the same state as the chip's eye); a table under it puts the scenarios side by side as numbers.
- **Progress** — wealth tracking. Log actual balances per account, see on/off-track status against your plan, and compare actuals to the projection over time.
- **Setup** — what Progress measures with: the milestone ladder and the wealth accounts each check-in records a balance for.

### The plan

One saved scenario per owner is *the plan*: `goal_scenarios.is_active`, set with **Use as my plan** in the scenario editor and enforced by a partial unique index so an owner can never have two. Progress, the dashboard Goals card and every check-in delta measure against it. The editor's selection is a different thing: loading another scenario to explore it does not change what you are measured against. An owner's first scenario becomes the plan on creation; deleting the plan leaves none until another is chosen.

Two questions, two sources. *How far along am I* is a balance and comes from check-ins, which capture market value however the money arrived. *Am I keeping the pace* is a flow and comes from the `investment` transactions put in per month since the plan's start date, withdrawals left out (`monthlyFlows` and `monthsSincePlanStart` in `engine/goals.ts`), compared with the plan's monthly contribution on the dashboard card and in the "Actual investing vs plan" chart. Net saving is drawn beside it for context only; the gap between the two is money that stayed in the current account. A one-off inflow belongs in the plan as a life event or a re-baseline, not in the monthly average.

A third question, *is being behind a saving problem or a market one*, is the measured return on the Progress snapshot (`portfolioReturn` in `engine/portfolioReturn.ts`). It is a linked Modified Dietz: each stretch between two consecutive check-ins gets its own return, the end balance less the start balance less the net flows, over the start balance plus each flow weighted by the share of the stretch it was in for, and the stretches are chained. That is the standard approximation of a time-weighted return, the same kind of figure as the plan's expected rate, and it gets closer to the true one the more often check-ins are logged. Flows are `investment` transactions: positive going in, negative coming back out, which is how a sale to cash or a dividend paid out is recorded (the form calls it Withdraw). A check-in is the balance at the end of its day, so a flow dated a check-in belongs to the stretch that ends there. The figure reads "so far" under a year and as a yearly rate from a year on, set against the plan's expected return as it is: the plan is nominal, on/off track compares nominal check-in balances with the plan line grown at that rate, so a portfolio that returned exactly the plan's rate is exactly on plan and the two lines agree. It is null with fewer than two check-ins thirty days apart, and when a stretch starts at nothing yet ends with money that no transaction accounts for.

A gap that holds still is the plan's starting point, not the saving, so the snapshot offers a re-baseline (`steadyGap` in `engine/steadyGap.ts`) when the check-ins reaching back at least 180 days number three or more, all sit on the same side of the plan, their spread from smallest to largest gap is within a quarter of the mean gap, and that mean is worth at least three months of the plan's contribution. Below that it is on-plan noise and stays quiet. The button writes the plan's start to the latest check-in and patches the editor's draft of the same plan, so Plan does not then offer to save the old start back.

## Return and contributions

| Parameter | Default (demo) |
| --- | --- |
| Real return | 7% / year |
| Contribution growth | 0% / year (adjustable per scenario in Goals UI) |
| Net retention (salary model) | 65% of gross — **engine helper only** (`annualSavingsFromCashflow`); charts use explicit `monthlyContributionCents` |

`annualContributionGrowth`: each year's monthly contribution compounds by this rate, so `monthlyContribution[y] = monthlyContributionCents × (1 + growth)^(y - 1)`. Year 1 contributes the amount you entered, and growth first applies in year 2. Exposed as a percentage slider in GoalControls.

## Housing

| Parameter | Default (demo) |
| --- | --- |
| House price | User input / saved scenario |
| Down payment | 20% |
| Transaction costs | €500 |
| House appreciation | 2.5% / year |
| Mortgage | 3% × 30 years |
| Rent (when not owning) | €1,200 / month |
| Home carry (rent vs buy) | 1.5% / year of home value (maintenance + tax + insurance; engine default, not yet a UI control) |

`housePurchaseYear`: `null` = never buy; `0` = owned from day one (capital already
allocated); `N > 0` = buy after year N (withdraw down payment + costs that year).

## Rent vs buy

Symmetric **net worth** comparison via `projectRentVsBuy` (`src/domain/engine/rentVsBuy.ts`):

- **Rent & invest:** starts with down payment + transaction costs in a side portfolio; each year invests the surplus when rent + invested cash beats buyer outlay.
- **Buy now:** equity (appreciation − mortgage) plus any side portfolio when buying costs less than renting.

Breakeven = first year buyer net worth ≥ renter net worth. Simplifications: constant rent, fixed carry rate (1.5%/yr default, not yet a UI control), no selling costs or transaction friction on resale.

## Net worth over time

The Progress history chart joins the check-ins on a calendar axis ending today: total net worth (debts subtracted) and the invested balance. Once any check-in carries a balance against a debt-kind account, a third line, assets (everything owned, debts left out), joins them, so a mortgage taken on in one month reads as a loan rather than as a loss of net worth. Without debt the two would coincide, so it stays off.

## Cash reserve

`settings.cashReserveMonths` (`cash_reserve_months`, 0 = no target) is the emergency-fund target in months of spending, set under the Goals tab's Setup view. Progress takes the live cash-kind accounts with a balance in the latest check-in and divides by the mean expenses of the last twelve completed budget months that recorded any (`cashReserve` in `engine/cashReserve.ts`), and says how many months they cover, against the target when there is one. With no such balance the line stays off rather than reading as zero. It never enters the invested-only tracking above.

## Milestones

Per-owner list of named net-worth targets, measured against the **invested portfolio only**. Edited from the Goals tab's Setup view and stored as JSON in `settings.milestones`; up to 12 entries, each with an optional name and an optional target date (`targetDate`, YYYY-MM-DD). With a target date, Progress dates the plan's crossing of the amount (`milestoneCrossingDate`, interpolated inside the crossing year from the plan start) and says on track or late; without one it shows the expected date alone. Once the plan's own date has passed with no check-in reaching the amount it says not reached yet, whatever the target, since from then on the check-ins have the say. A check-in at or above the amount counts as reached whatever the plan says.

A named milestone is always shown with its amount, since the name alone does not say how far away the target is. In prose that reads "House deposit (100k €)" (`milestoneLabelWithAmount`); in the years-to-milestone matrix the two are stacked on separate header lines, with the full name and reached date in the header's tooltip because columns are narrow. An unnamed milestone shows only its amount.

Owners who have never customised the list get the built-in ladder: €100k, €200k, €300k, €400k, €500k, €750k, €1M. That is a fallback for a `NULL` column, not a floor — an empty list is a valid choice and leaves the matrix and chart reference lines empty.

A milestone counts as **reached** once any wealth check-in recorded an invested value at or above it. The date shown is that check-in's date, so it is "reached by", not "reached on" — the actual crossing happened somewhere between two check-ins. Reached milestones stay reached even if the portfolio later falls back below them.

Chart reference lines are capped relative to the projection's own ceiling. A milestone far above what the plan reaches is left off the chart rather than compressing the projection into a sliver at the bottom; it still appears in the matrix.

## FIRE / withdrawal

Safe withdrawal rate defaults to 4% (25× annual spend). Adjustable per scenario.

## Life events

One-off cash flows applied to the invested portfolio in a specific projection year:

```ts
interface LifeEvent {
  year: number        // projection year (0 = year zero / initial balance)
  amountCents: number // positive = inflow, negative = outflow
  label: string       // short description, e.g. "Inheritance", "Car purchase"
}
```

Stored as a JSON column (`life_events`) on `goal_scenarios`. Applied in the yearly loop after growth and contributions, before house purchase withdrawal. Year 0 is the initial balance — events at year 0 are not applied by the engine and not accepted by the UI (minimum year is 1). Rendered as diamond markers on the hero chart (green for inflows, amber for outflows).

## Uncertainty bands

The hero chart shows a shaded band for ±3 pp around the scenario's `expectedRealReturn`, computed by `projectNetWorthBand` in `scenarioProjection.ts`. The band uses the same contribution and housing logic as the main projection. Chart layer: `kind: 'band'` on `ChartSeries`, rendered by `ChartBandLayer` in `linearChartParts.tsx`.

## Real, and the nominal view

The plan is real: the return is a real return, so every projected figure, the FI target, the constant rent and withdrawal, the milestones and the comparison table are in today's money. Check-ins are broker balances in the money of their day, so wherever Progress sets one against the plan (`trackStatus`, the "Actual vs plan" chart, the measured return) the balance is deflated first, by `DEFAULT_INFLATION_RATE` (2%, approximating the ECB target) over the years since the plan start. Milestones reached are the exception: a milestone counts as reached when a check-in shows the number, in the money of that day.

The hero chart shows the plan in today's money by default. Its footer toggle switches to a nominal view, which inflates every drawn figure at a rate the user can adjust there (the same 2% by default), and leaves the check-in dots as they are, since they are already nominal:

```
nominal[y] = real[y] × (1 + rate)^y
```

In the default view the dots are deflated by their own fractional year offset (`xIndex`) instead, so an actual exactly on plan sits on the line either way (`inflateSeries` and `deflatePoints` in `nominalTransform.ts`).

## Engine formula

Each year `y = 1…N`:

```
contribution[y] = monthlyContributionCents × 12 × (1 + contributionGrowth)^(y - 1)
invested[y] = invested[y-1] × (1 + expectedReturn) + contribution[y] + lifeEventImpact(y)
```

At `housePurchaseYear > 0`, after growth and contribution that year:

```
invested[y] -= downPayment + transactionCosts
```

House equity after purchase: `housePrice × (1 + appreciation)^yearsOwned`.

Net worth = invested + house equity − mortgage balance.

## Wealth check-ins and time anchoring

### Plan start date

`goal_scenarios.plan_start_date` (ISO date, editable per scenario) anchors the projection to the calendar. Re-baselining (from the editor, or from the Progress snapshot's button, which asks first) sets it and `start_invested_cents` from the latest check-in and moves life events and the house purchase year by the whole years the start moved (`rebaseline` in `engine/rebaselinePatch.ts`), dropping an event now behind the new start, since its money is already in the balance the plan restarts from. Used by:

- `yearOffsetFromDate(planStartDate, date)` — converts a calendar date to a fractional projection-year offset.
- `planValueAtOffset(scenario, offset)` — interpolates the projected invested value at a fractional year offset.
- `planValueAtDate(scenario, date)` — wraps the above with a calendar date.
- `trackStatus(checkin, scenario, accounts)` — compares actual invested balance to plan projection at check-in date; returns delta in cents and months ahead/behind.

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
  deltaCents: number       // actual invested − plan invested (positive = ahead)
  deltaMonths: number      // equivalent lead/lag in months (via local slope)
  planCents: number        // what the plan projected at this date
}
```

Displayed in `WealthSummaryCard` (Progress view) and `GoalsCard` (dashboard badge), both against the plan (`activePlan` in `scenarioSelection.ts`), never against whatever the editor has loaded.

## Seeding personal scenarios

Copy [`config/goal-scenarios.seed.example.json`](../config/goal-scenarios.seed.example.json)
to gitignored `config/goal-scenarios.seed.json`, or maintain
`config/goal-scenarios.seed.json` in that private repo, then run
`scripts/seed-scenarios.ts`. Keep seed JSON gitignored; review history hygiene before open-sourcing.
