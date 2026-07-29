# Goals projection model

Year-by-year wealth projection for the Goals tab. Canonical personal assumptions
live in the private `finance-review` repo; the public app reads saved scenarios
from D1 only.

## Overview

The Goals tab has two views:

- **Plan** — projection lab. Configure scenarios, compare alternatives, see the hero net-worth chart with uncertainty bands and life-event markers.
- **Progress** — wealth tracking. Log actual balances per account, see on/off-track status against the active scenario, and compare actuals to the projection over time.

## Return and contributions

| Parameter | Default (demo) |
| --- | --- |
| Real return | 7% / year |
| Contribution growth | 0% / year (adjustable per scenario in Goals UI) |
| Net retention (salary model) | 65% of gross — **engine helper only** (`annualSavingsFromCashflow`); charts use explicit `monthlyContributionCents` |

`annualContributionGrowth`: each year's monthly contribution compounds by this rate, so `monthlyContribution[y] = monthlyContributionCents × (1 + growth)^y`. Exposed as a percentage slider in GoalControls.

## Housing

| Parameter | Default (demo) |
| --- | --- |
| House price | User input / saved scenario |
| Down payment | 20% |
| Transaction costs | €500 |
| House appreciation | 2.5% / year |
| Mortgage | 3% × 30 years |
| Rent (when not owning) | €1,200 / month |
| Home carry (rent vs buy) | 1.5% / year of home value (maintenance + tax + insurance; adjustable per scenario in GoalControls) |

`housePurchaseYear`: `null` = never buy; `0` = owned from day one (capital already
allocated); `N > 0` = buy after year N (withdraw down payment + costs that year).

## Rent vs buy

Symmetric **net worth** comparison via `projectRentVsBuy` (`src/domain/engine/rentVsBuy.ts`):

- **Rent & invest:** starts with down payment + transaction costs in a side portfolio; each year invests the surplus when rent + invested cash beats buyer outlay.
- **Buy now:** equity (appreciation − mortgage) plus any side portfolio when buying costs less than renting.

Breakeven = first year buyer net worth ≥ renter net worth. Simplifications: constant real rent, fixed carry rate (1.5%/yr default, not yet a UI control), no selling costs or transaction friction on resale.

## Milestones

€100k, €200k, €300k, €400k, €500k, €750k, €1M (invested portfolio only).

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

Stored as a JSON column (`life_events`) on `goal_scenarios`. Applied in the yearly loop after growth and contributions, before house purchase withdrawal. Year 0 events are not applied (year 0 is the initial balance). Rendered as diamond markers on the hero chart (green for inflows, amber for outflows).

## Uncertainty bands

The hero chart shows a shaded band for ±2 pp around the scenario's `expectedRealReturn`, computed by `projectNetWorthBand` in `scenarioProjection.ts`. The band uses the same contribution and housing logic as the main projection. Chart layer: `kind: 'band'` on `ChartSeries`, rendered by `ChartBandLayer` in `linearChartParts.tsx`.

## Nominal vs real display

The hero chart defaults to real (inflation-adjusted) values. A toggle in the chart footer switches to nominal:

```
nominalValue[y] = realValue[y] × (1 + 0.02)^y
```

The 2% rate approximates the ECB target. Check-in scatter points are also scaled by their fractional year offset (`xIndex`) so actuals stay aligned with the nominal projection line.

## Engine formula

Each year `y = 1…N`:

```
contribution[y] = monthlyContributionCents × 12 × (1 + contributionGrowth)^y
invested[y] = invested[y-1] × (1 + realReturn) + contribution[y] + lifeEventImpact(y)
```

At `housePurchaseYear > 0`, after growth and contribution that year:

```
invested[y] -= downPayment + transactionCosts
```

House equity after purchase: `housePrice × (1 + appreciation)^yearsOwned`.

Net worth = invested + house equity − mortgage balance.

## Wealth check-ins and time anchoring

### Plan start date

`goal_scenarios.plan_start_date` (ISO date, editable per scenario) anchors the projection to the calendar. Used by:

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

Displayed in `WealthSummaryCard` (Progress view) and `GoalsCard` (dashboard badge).

## Seeding personal scenarios

Copy [`config/goal-scenarios.seed.example.json`](../config/goal-scenarios.seed.example.json)
to gitignored `config/goal-scenarios.seed.json`, or maintain
`config/goal-scenarios.seed.json` in `finance-review`, then run
`scripts/seed-scenarios.ts`. Keep seed JSON gitignored; review history hygiene before open-sourcing.
