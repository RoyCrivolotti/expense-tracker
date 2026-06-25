# Goals projection model

Year-by-year wealth projection for the Goals tab. Canonical personal assumptions
live in the private `finance-review` repo; the public app reads saved scenarios
from D1 only.

## Return and contributions

| Parameter | Default (demo) |
| --- | --- |
| Real return | 7% / year |
| Contribution growth | 0% / year (adjustable per scenario in Goals UI) |
| Net retention (salary model) | 65% of gross — **engine helper only** (`annualSavingsFromCashflow`); charts use explicit `monthlyContributionCents` |

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

Breakeven = first year buyer net worth ≥ renter net worth. Simplifications: constant real rent, fixed carry rate (1.5%/yr default, not yet a UI control), no selling costs or transaction friction on resale.

## Milestones

€100k, €200k, €300k, €400k, €500k, €750k, €1M (invested portfolio only).

## FIRE / withdrawal

Safe withdrawal rate defaults to 4% (25× annual spend). Adjustable per scenario.

## Engine formula

Each year `y = 1…N`:

```
invested[y] = invested[y-1] × (1 + realReturn) + annualContribution
```

At `housePurchaseYear > 0`, after growth and contribution that year:

```
invested[y] -= downPayment + transactionCosts
```

House equity after purchase: `housePrice × (1 + appreciation)^yearsOwned`.

Net worth = invested + house equity − mortgage balance.

## Seeding personal scenarios

Copy [`config/goal-scenarios.seed.example.json`](../config/goal-scenarios.seed.example.json)
to gitignored `config/goal-scenarios.seed.json`, or maintain
`config/goal-scenarios.seed.json` in `finance-review`, then run
`scripts/seed-scenarios.ts`. See [`PUBLIC_READINESS.md`](./PUBLIC_READINESS.md).
