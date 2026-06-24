# Goals projection model

Canonical assumptions for the interactive Goals view, ported from
`finance-review/scripts/03_refinement.py` and `05_savings_sensitivity.py`.

## Return and contributions

| Parameter | Value |
| --- | --- |
| Real return (default) | 7% / year |
| Realistic annual contribution | €600 / year (€255 / month) |
| Net retention | 71.2% of gross |
| On-call (future) | €500 / month |

## Housing

| Parameter | Value |
| --- | --- |
| House price | €400,000 |
| Down payment | 30% (€157,500) |
| Transaction costs | €8,000 |
| Path 4 purchase year | Year 5 |
| House appreciation | 2.5% / year |
| Mortgage | 2% × 30 years |
| Rent (Path 2/4) | ~€1,500 / month |

## Path starting invested balances

| Path | Start invested | House timing |
| --- | ---: | --- |
| Path 2 | €100,000 | Never |
| Path 3 | €50,000 | Owned from day one |
| Path 4 | €100,000 | Buy at year 5 (withdraw €165,500) |

## Milestones

€100k, €200k, €300k, €400k, €500k, €750k, €1M (invested portfolio only).

## FIRE / withdrawal

Safe withdrawal rate defaults to 4% (25× annual spend). Constitution independence
target uses ~5–6% real over 30 years; adjustable in the UI.

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
