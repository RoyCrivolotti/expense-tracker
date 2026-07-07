# Screenshot gallery

Full visual reference for the expense tracker UI. Fixture data (`fixtures/demo-expenses.csv`). Access admin and Transactions **Upcoming** use `DOCS_CAPTURE=1` mocks during capture.

Regenerate all images:

```bash
npm run capture:screenshots
```

Output: [`screenshots/gallery/`](./screenshots/gallery/).

Goals shots use three demo scenarios from [`fixtures/demo-goal-scenarios.json`](../fixtures/demo-goal-scenarios.json). The capture script sets `DOCS_CAPTURE=1` to seed those paths automatically.

## Dashboard

| Desktop (dark) | Mobile (dark) |
| --- | --- |
| ![Dashboard desktop](./screenshots/gallery/dashboard-desktop.png) | ![Dashboard mobile](./screenshots/gallery/dashboard-mobile.png) |

| Desktop (light) |
| --- |
| ![Dashboard desktop light](./screenshots/gallery/dashboard-desktop-light.png) |

## Transactions

| Desktop | Mobile |
| --- | --- |
| ![Transactions desktop](./screenshots/gallery/transactions-desktop.png) | ![Transactions mobile](./screenshots/gallery/transactions-mobile.png) |

Mobile detail: collapsible filters with **date scope** dropdown, recurring **Upcoming** suggestions, **+** on each day header, swipe-left **Copy** / **Delete** (animated snap, tap row to close when open), active-filter badge with **Clear filters**, and **»** jump to latest budget month when viewing a past month.

| Filters expanded | Active filters + clear |
| --- | --- |
| ![Transactions filters](./screenshots/gallery/transactions-mobile-filters.png) | ![Transactions active filters](./screenshots/gallery/transactions-mobile-active.png) |

| Past month (» latest) |
| --- |
| ![Transactions past month](./screenshots/gallery/transactions-mobile-past.png) |

## Analytics

| Desktop | Mobile |
| --- | --- |
| ![Analytics desktop](./screenshots/gallery/analytics-desktop.png) | ![Analytics mobile](./screenshots/gallery/analytics-mobile.png) |

## Goals

Multi-scenario wealth planner: three saved paths plus an unsaved draft, FI progress, FIRE drawdown, rent-vs-buy net worth, and actual saving vs plan. Desktop secondary charts default to a full-width stack with an optional single-chart tab mode; mobile uses a scrollable chart picker.

| Desktop overview | Mobile overview |
| --- | --- |
| ![Goals desktop](./screenshots/gallery/goals-desktop.png) | ![Goals mobile](./screenshots/gallery/goals-mobile.png) |

| Full page (desktop) | Secondary charts stack (desktop) |
| --- | --- |
| ![Goals desktop full](./screenshots/gallery/goals-desktop-full.png) | ![Goals charts desktop](./screenshots/gallery/goals-desktop-charts.png) |

| Glossary (desktop) | Scenarios (mobile) |
| --- | --- |
| ![Goals explainer desktop](./screenshots/gallery/goals-desktop-explainer.png) | ![Goals scenarios mobile](./screenshots/gallery/goals-mobile-scenarios.png) |

| Glossary (mobile) | Composition (mobile) |
| --- | --- |
| ![Goals explainer mobile](./screenshots/gallery/goals-mobile-explainer.png) | ![Goals composition mobile](./screenshots/gallery/goals-mobile-composition.png) |

| FIRE drawdown (mobile) | Rent vs buy (mobile) |
| --- | --- |
| ![Goals FIRE mobile](./screenshots/gallery/goals-mobile-fire.png) | ![Goals rent mobile](./screenshots/gallery/goals-mobile-rent.png) |

| Actual saving vs plan (mobile) | Milestones (mobile) |
| --- | --- |
| ![Goals savings mobile](./screenshots/gallery/goals-mobile-savings.png) | ![Goals milestones mobile](./screenshots/gallery/goals-mobile-milestones.png) |

## Settings

| Desktop | Mobile |
| --- | --- |
| ![Settings desktop](./screenshots/gallery/settings-desktop.png) | ![Settings mobile](./screenshots/gallery/settings-mobile.png) |

## Access admin

| Desktop | Mobile |
| --- | --- |
| ![Access admin desktop](./screenshots/gallery/access-admin-desktop.png) | ![Access admin mobile](./screenshots/gallery/access-admin-mobile.png) |
