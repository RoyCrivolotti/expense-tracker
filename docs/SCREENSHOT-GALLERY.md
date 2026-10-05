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

Header **Refresh** appears on every tab (not shown in cropped dashboard shots). **Card statements** on Dashboard show one row per deferred card with its status (Due / Paid · date / Nothing to settle) and amount. A due card has a **Mark as paid today** button under its row; tap the row itself to open the same paid/due editor used on Settings and Transactions.

| Desktop (light) |
| --- |
| ![Dashboard desktop light](./screenshots/gallery/dashboard-desktop-light.png) |

## Transactions

| Desktop (May — April statement paid 14 May) | Mobile |
| --- | --- |
| ![Transactions desktop](./screenshots/gallery/transactions-desktop.png) | ![Transactions mobile](./screenshots/gallery/transactions-mobile.png) |

May budget month shows **Travel Credit statement** for the prior month on its paid date. Tap a statement row to edit the paid date. May's own statement settles in June and appears in the June tab.

Mobile detail: collapsible filters with **date scope** dropdown, recurring **Upcoming** suggestions, **+** on each day header, swipe-left **Copy** / **Delete** (animated snap, tap row to close when open), active-filter badge with **Clear filters**, and **»** jump to latest budget month when viewing a past month.

| Filters expanded | Active filters + clear |
| --- | --- |
| ![Transactions filters](./screenshots/gallery/transactions-mobile-filters.png) | ![Transactions active filters](./screenshots/gallery/transactions-mobile-active.png) |

| Past month (» latest) |
| --- |
| ![Transactions past month](./screenshots/gallery/transactions-mobile-past.png) |

## Flags, expense reports and settlement

Flag a transaction as reimbursable — a work trip, say — and the **Flagged** card groups what is
still owed to you, across every month rather than just the one on screen.

| Flagged card (desktop) | Flagged card (mobile) |
| --- | --- |
| ![Flagged card desktop](./screenshots/gallery/flagged-card-desktop.png) | ![Flagged card mobile](./screenshots/gallery/flagged-card-mobile.png) |

**Expense report** turns a flag into a document to hand to an employer: claimant, reference, period,
per-line business purpose, and `R1`/`R2` cross-references tying each row to a numbered receipt. Rows
with no receipt are listed and each one opens its editor, so the gap is fixable from here rather than
being a warning you have to go and act on somewhere else. A PDF receipt cannot be drawn into the page
— it is named and numbered instead, to be sent alongside.

| Expense report (desktop) | Expense report (mobile) |
| --- | --- |
| ![Expense report desktop](./screenshots/gallery/expense-report-desktop.png) | ![Expense report mobile](./screenshots/gallery/expense-report-mobile.png) |

**Record reimbursement** settles a claim line by line. Tick what the payment actually covered —
employers rarely pay a claim exactly — and anything left unticked stays owed. Naming the report is
what you will recognise it by later.

| Record reimbursement (desktop) | Record reimbursement (mobile) |
| --- | --- |
| ![Record reimbursement desktop](./screenshots/gallery/record-reimbursement-desktop.png) | ![Record reimbursement mobile](./screenshots/gallery/record-reimbursement-mobile.png) |

Settled rows leave the Flagged card but keep a two-way link to the payment, so **Past reports** can
rebuild any report you have already submitted.

| Past reports (desktop) | Past reports (mobile) |
| --- | --- |
| ![Past reports desktop](./screenshots/gallery/past-reports-desktop.png) | ![Past reports mobile](./screenshots/gallery/past-reports-mobile.png) |

## Analytics

Three views under one sticky row, the same on phone and desktop. **Overview** answers "how am I
doing": five KPI tiles with change chips and sparklines, a trend chart whose unpaid card charges
are hatched, the flexible-spending pace, up to three signals, where the income went, what changed
against your 3-month average, and the spending baseline with a handoff into Goals. **Spending**
answers "where does it go": ranked rows grouped by category, fixed vs flexible, label or description,
each opening its story and a deep link into Transactions; the exact workbook grid stays as the
Grid mode, with CSV export. **Cash** answers "do my numbers match": one dot per month close, a
bridge from opening cash to expected cash with the count entered under it, drift bars with a ±5 €
tolerance band, and balances labelled as cost; the full table sits in a fold. A committed/paid
basis toggle (committed by default, matching budgets and the Dashboard) applies to Overview and
Spending; Cash is paid-basis by nature. An open month is only compared with the same days of
other months.

| Overview (desktop) | Overview (mobile) |
| --- | --- |
| ![Analytics desktop](./screenshots/gallery/analytics-desktop.png) | ![Analytics mobile](./screenshots/gallery/analytics-mobile.png) |

| Spending (desktop) | Spending (mobile) |
| --- | --- |
| ![Analytics spending desktop](./screenshots/gallery/analytics-spending-desktop.png) | ![Analytics spending mobile](./screenshots/gallery/analytics-spending-mobile.png) |

| Cash (desktop) | Cash (mobile) |
| --- | --- |
| ![Analytics cash desktop](./screenshots/gallery/analytics-cash-desktop.png) | ![Analytics cash mobile](./screenshots/gallery/analytics-cash-mobile.png) |

## Goals

Multi-scenario wealth planner in three views. Plan: three saved paths plus an unsaved draft, FI progress, FI drawdown, rent-vs-buy net worth, and actual saving vs plan. Progress: dated check-ins with on/off-track status, net worth over time, and actual vs plan. Assumptions: the milestone ladder, the wealth accounts, the cash reserve and the assumed inflation. On desktop Plan is one column: the scenario tabs, the projection across the page, a bar of the five inputs a plan is mostly tuned with (held to the bottom edge of a wide and tall enough screen while it is below the fold, under the header once scrolled past, and going by with the page on a narrower one), the other inputs opened from "All inputs", and the detail charts in two columns, with the intro and glossary last. Mobile uses a scrollable chart picker. On a phone one row under the header switches between Chart, Progress, Scenarios and Assumptions (Plan is Chart and Scenarios there), and the mobile overview is Chart, which opens on the projection chart with the glossary below the charts.

| Desktop overview | Mobile overview |
| --- | --- |
| ![Goals desktop](./screenshots/gallery/goals-desktop.png) | ![Goals mobile](./screenshots/gallery/goals-mobile.png) |

| Scenarios (mobile) |
| --- |
| ![Goals adjust mobile](./screenshots/gallery/goals-mobile-adjust.png) |

Scenarios opens at its first section. The draft's chart and the section chips stay pinned under the view row while the controls scroll, and Save and Discard join the chips once a saved scenario has edits.

| Progress (desktop) | Progress (mobile) |
| --- | --- |
| ![Goals progress desktop](./screenshots/gallery/goals-desktop-progress.png) | ![Goals progress mobile](./screenshots/gallery/goals-mobile-progress.png) |

| Assumptions (desktop) | Assumptions (mobile) |
| --- | --- |
| ![Goals assumptions desktop](./screenshots/gallery/goals-desktop-assumptions.png) | ![Goals assumptions mobile](./screenshots/gallery/goals-mobile-assumptions.png) |

| Full page (desktop) | Detail charts (desktop) |
| --- | --- |
| ![Goals desktop full](./screenshots/gallery/goals-desktop-full.png) | ![Goals charts desktop](./screenshots/gallery/goals-desktop-charts.png) |

| All inputs open (desktop) | Scenario menu (desktop) |
| --- | --- |
| ![Goals inputs desktop](./screenshots/gallery/goals-desktop-inputs.png) | ![Goals menu desktop](./screenshots/gallery/goals-desktop-menu.png) |

| Glossary (desktop) | Scenarios (mobile) |
| --- | --- |
| ![Goals explainer desktop](./screenshots/gallery/goals-desktop-explainer.png) | ![Goals scenarios mobile](./screenshots/gallery/goals-mobile-scenarios.png) |

| Glossary (mobile) | Composition (mobile) |
| --- | --- |
| ![Goals explainer mobile](./screenshots/gallery/goals-mobile-explainer.png) | ![Goals composition mobile](./screenshots/gallery/goals-mobile-composition.png) |

| FI drawdown (mobile) | Rent vs buy (mobile) |
| --- | --- |
| ![Goals FI mobile](./screenshots/gallery/goals-mobile-fire.png) | ![Goals rent mobile](./screenshots/gallery/goals-mobile-rent.png) |

| Actual saving vs plan (mobile) | Milestones (mobile) |
| --- | --- |
| ![Goals savings mobile](./screenshots/gallery/goals-mobile-savings.png) | ![Goals milestones mobile](./screenshots/gallery/goals-mobile-milestones.png) |

## Settings

| Desktop | Mobile |
| --- | --- |
| ![Settings desktop](./screenshots/gallery/settings-desktop.png) | ![Settings mobile](./screenshots/gallery/settings-mobile.png) |

**Card statements** section: one tap-to-edit row per account per month, each showing its charge amount — same row and editor used on Dashboard and Transactions.

## Access admin

| Desktop | Mobile |
| --- | --- |
| ![Access admin desktop](./screenshots/gallery/access-admin-desktop.png) | ![Access admin mobile](./screenshots/gallery/access-admin-mobile.png) |
