# Changelog (product-facing)

High-signal UX and reliability changes on `main`. Internal refactors omitted unless they affect behavior.

## September 2026 (wealth follow-ups)

- **The plan is in today's money, and Progress compares like with like.** The projection, the FI target, the milestones and the comparison table are real; a check-in is a balance in the money of its day, so on/off track, "Actual vs plan" and the measured return take the assumed inflation off it before setting it against the plan. That is one setting, 2% until you change it, in Setup beside the cash reserve target; every Goals view uses it, and the Nominal view's note shows it and links there. The hero chart opens on Purchasing power, and its Nominal view inflates the plan and its band at the same rate; the FI and milestone lines are only drawn in today's money.
- **Withdraw.** Money taken out of the portfolio (a sale to cash, a dividend paid out) is recorded as a negative investment. The goals pace counts only what went in, and the measured return chains across check-ins and counts what came out.
- **Milestones and accounts live under Setup**, with an optional target date for a milestone, and Progress says whether you are on track, late or overdue for it.
- **A cash reserve target**, in months of spending, set under Setup; Progress says how many months your cash accounts cover.
- **Re-baseline from Progress** asks first and says what it will change: the new start, the start it replaces, the monthly investing a growing contribution has reached, and where each life event and the house purchase land. Events already behind the new start are dropped, since their money is in the balance.
- **A check-in nudge** on the dashboard once the last one is a month old, and a hint to re-baseline when the gap to the plan has held still for half a year.
- **The scenario comparison table, shorter windows on the history chart, and horizon windows with a legend that hides lines on the hero chart.**
- **Housing is in today's money too.** The mortgage rate and house appreciation are nominal, as quoted; the plan takes the assumed inflation off both.
- **Fixes.** A new account's check-in field starts empty instead of "0,00" (typing appended to it); an unknown scenario id from a stale tab no longer leaves you with no active plan; switching scenarios from "Unsaved draft" asks before dropping edits; a failed cash reserve or re-baseline save says so instead of looking saved; a CSV import names the line it refused.

## September 2026 (correctness pass)

Mostly fixes to things the app was getting quietly wrong rather than new ground.

- **A sent expense report stops changing after you send it.** Reports were recomputed from live rows every time you opened one, so editing or deleting a covered transaction afterwards silently rewrote your record of what you had submitted. What a report covered is now stamped when it is settled, and a report whose rows have since moved says so instead of redrawing itself.
- **Bulk actions report what happened, not what you asked for.** Deleting five rows where one had already gone elsewhere still said "Deleted 5". The count now comes from the server, and reads "Deleted 4 of 5" when they differ.
- **Settling several transactions no longer half-succeeds.** If one of them had already been settled by a different reimbursement, the others were committed before the conflict was raised, so you were told the whole thing failed while part of it had gone through. Every row is checked before any is written.
- **Reimbursement failures say something true.** The old message claimed nothing had been recorded even when a refund transaction existed, which invited you to create a second one. There are now three messages for the three things that actually happen.
- **The purchasing-power toggle stops overstating your progress.** Switching to real terms deflated the projection line but left the check-in dots at nominal values, so a scenario you were exactly on track for could read as far ahead of plan.
- **Future-dated wealth check-ins are refused**, on the phone as well. The date field had been trusting an HTML attribute that iOS Safari ignores outright.
- **Bulk edit uses your budget rollover day** when it prefills the budget month, instead of the calendar month, so it no longer assigns a month a single edit never would.
- **Exported CSVs cannot execute.** A description beginning with `=` or `+` is neutralised on the way out and restored on the way back in.
- **Installments stay visible and say when one is paid.** The Installments card sat behind the same one-day "due soon" gate as the guessed recurring bills, so a declared plan vanished until its payment was nearly due, and again as soon as it was logged. It now shows every plan's payment for the viewed month as Due or Paid, with the real payment date.
- **A finished plan closes itself.** A plan stayed active after its last payment until someone pressed Complete. It now completes when the final installment is recorded, and plans that had already finished were closed out in one pass.
- **Paid no longer overstates a card charge.** An installment on a credit card read Paid the moment it was logged, even while its card statement was unpaid and the same charge read Forecast in the list. The Installments card and the plan progress line now say Forecast too.
- **Credit-card installments create themselves.** Nothing tells the app a card charged this month's installment, and it is a certainty from the day the plan is made, so the first time you open the app after a month comes due, that month's installment is added for you. Missed months are all added at once, oldest first. Debit-card plans stay manual, because logging one is the only sign the money left the account. It counts a month as due by your budget rollover day, not the calendar.
- **Installment dates follow the month the charge posts.** If you count a charge in the month its card bill is paid, a first installment dated in August and counted in September was followed by one dated and counted in October, a month late and in the future. The gap is now read from the plan's first installment, so the second is dated in September and counted in October.
- **Installment rows are easier to read.** Each row used to run its whole story together in one dotted line. On a wide screen it is now a table with column headers (plan and position, Debit or Credit, last payment, amount, status). On a phone it is two lines, and three below 375px so the name still fits. The status is a single pill with the date inside ("Due 12 Jun", "Forecast for Jun", "Paid 4 Jun"), so a credit-card installment no longer shows Paid and Forecast together, and once its statement is paid it shows the day you recorded paying it instead of the day of the charge. Manage plans uses the same words. Pill text is also darker in the light theme, where it was about 2.3:1 against its tint and is now above 5:1.

## July 2026 (follow-ups)

- **Budget month on transaction rows.** Every row now carries the budget month it is charged to, so filtering across months (investments over a year, say) no longer loses track of which month each row belongs to, and the "31 Jul charged to the Aug budget" rollover reads straight off the row. The month sits under the amount, alongside the `Forecast` badge, which gives the category and account names the full width of the row and lines the months up in a column down the right edge. Every row is the same height at every screen width.
- **Readable milestone matrix.** With named milestones the years-to-milestone table used to squeeze every column into an equal sliver and let long labels overlap their neighbours. Columns now size to their content and the table scrolls sideways with the scenario names pinned. Headers stack the name over the amount, with the full name and reached date on hover.
- **Named milestones show their amount too.** Previously a name replaced the amount, so "Coast FI" gave no sense of the target. Named milestones now read "Coast FI (150k €)" throughout the Goals tab.

## July 2026 (Goals & Wealth Management overhaul)

### Goals tab — Plan view

- **Scenario editor now exposes previously hidden engine controls.** Contribution growth, mortgage rate, mortgage term, and house appreciation are available as sliders and inputs in GoalControls (previously engine-only constants). Home carry rate remains an engine default for now.
- **Uncertainty band on the hero chart.** A shaded band around each scenario's projection shows the ±3 pp return spread, making "good year vs bad year" visible without Monte Carlo.
- **Life events.** Add one-off cash flows (inheritances, car purchases, etc.) to any scenario with a year, amount, and label. Events appear as diamond markers on the chart and are stored per-scenario in the DB.
- **Nominal vs real display toggle.** Switch the hero chart between inflation-adjusted (real, default) and nominal values. Uses a 2% ECB-target inflation rate; check-in actuals are also scaled so they stay aligned with the projection.
- **FI target reference line.** When annual spend and a safe withdrawal rate are set, the FI number (annual spend ÷ SWR) appears as a reference line on the hero chart automatically.
- **Custom milestones.** The €100k–€1M ladder is no longer hardcoded. Edit your own list from the Goals tab's Progress view with optional names ("House deposit", "Coast FI") in place of bare amounts, up to 12 entries. Existing setups keep the old ladder until changed. Milestones your check-ins have already passed are marked as reached in the matrix and listed on the Progress view with the date they were first observed. Chart reference lines now scale to the projection, so an aspirational milestone far above the plan no longer flattens the chart.

### Goals tab — Progress view (new)

- **Plan / Progress segmented view.** The Goals tab now has two views. Plan is the existing projection lab; Progress is new.
- **Wealth accounts.** Create named accounts (investment, cash, other asset, debt) in the Progress view to track net-worth components by market value separately from expense categories.
- **Wealth check-ins.** Log a dated snapshot of each account's market value. Check-ins are stored per-account and per-date; the full history is visible as a timeline.
- **On/off-track status.** After setting a plan start date on a scenario, each check-in compares actual invested balance to the scenario projection at that date and shows how many months ahead or behind plan you are.
- **Actuals overlay on the hero chart.** Check-ins appear as scatter points on the Plan-view hero chart so projected vs actual is visible in one place.
- **Dashboard badge.** The GoalsCard on the dashboard shows the on/off-track status from the latest check-in.

### Goals tab — Mobile (new)

- **Sticky "Adjust" button on mobile.** On narrow viewports the GoalControls panel is replaced by a sticky button at the bottom of the Plan view that opens a bottom-sheet overlay, keeping the chart in view while adjusting sliders.

### Transaction form

- **Inactive category warning.** An amber "This category is inactive" label now appears below the Category picker when the selected category is no longer active — easier to spot than the "(archived)" suffix in the dropdown.

## July 2026 (onboarding wizard re-entry fixes)

### Setup wizard

- **Finishing re-entry no longer reopens "add a transaction."** That only happens on a genuine first
  run now; re-opening the wizard from Settings to tweak currency or accounts just closes it.
- **Opting into an extra debit account on re-entry no longer silently changes your default account.**
  `settings.defaultAccountId` is only seeded by the wizard when nothing was configured yet.
- **Categories step no longer blocks re-entry at zero selections.** Presets default unchecked when
  you already have categories, and Continue no longer requires picking one — a plain note explains
  no new categories will be added instead of a "select at least one" warning. First run is unchanged.
- **Screen readers now announce each step change** — focus moves to the new step's heading instead of
  staying wherever it was.
- **A failed "Finish setup" no longer leaves orphaned categories/accounts behind.** If a later step
  fails (e.g. the account create call), whatever categories/accounts this run already created get
  cleaned up automatically instead of sticking around unused.

## July 2026 (onboarding wizard fixes, category/account delete)

### Setup wizard

- **Re-entry no longer silently resets settings.** Re-opening the wizard from Settings used to seed
  the Money step from hardcoded defaults, quietly reverting currency, number format, and budget
  rollover day back to EUR/`de-DE`/day-13 (the wizard's own old hardcoded fallback — unrelated to
  the app's actual built-in default of day 1) even if you'd already changed them. It now seeds from
  your actual saved settings.
- **Adding a new debit account is opt-in on re-entry.** First run still always creates one debit
  account (you need at least one to use the app); re-opening the wizard later shows an "Add another
  debit account" checkbox instead of silently creating a duplicate.
- **Confirmation popup before "Finish setup"** lists what will be created (categories, accounts)
  and shows the currency, number format, and budget rollover day from the Money step — always shown
  even if unchanged, since only the fields that actually differ from your saved settings get
  written — before anything is applied. Includes a plain note that it doesn't check for duplicate
  categories, so re-running the wizard's Categories step will add to what you already have, not
  replace it.
- **Checking "Add a credit card" now requires a name to finish setup**, matching the debit account
  field — previously it silently skipped creating the card if the name was left blank.
- **Keyboard focus stays inside the confirmation popup** while it's open, instead of Tab being able
  to reach Back/Continue/Skip behind it.
- **New categories added on re-entry now sort after your existing ones** instead of restarting at
  the top of the list.

### Categories & accounts

- **Delete a category or account**, from its edit screen. An unused one deletes outright; one still
  referenced by transactions, installment plans, or (for accounts) card statements offers a
  reassign-then-delete flow: move everything to another existing category/account, or create a new
  one inline (e.g. to fix a typo without leaving the delete flow) — the move and the delete happen
  together, so nothing is left half-reassigned. You can't delete your only remaining category or
  account.
- **New/edited transactions can no longer pick an inactive (archived) category or account** — the
  "Active" toggle now actually behaves like an archive for new entries. Editing a transaction still
  always shows its own current category/account even if it's since been archived, so editing any
  other field on that transaction never forces a reassignment. Every other view (filters, analytics,
  budget totals, CSV export) is unaffected and keeps showing archived categories/accounts as before.
- **Reassign targets are active categories/accounts only**, for the same reason — you can still
  create a brand-new one inline instead.
- **Deleting your default account no longer leaves Settings pointing at a deleted one.** It now
  moves to whatever the account's data was reassigned to (or clears to "none" if the account had no
  data and was just deleted outright).
- **Deleting a category/account that turns out to still be in use** (e.g. another tab added a
  transaction to it moments earlier) now offers the reassign flow directly instead of showing an
  error and leaving you to retry the same delete.
- **Archived categories/accounts are labeled "(archived)"** wherever a transaction or installment
  plan's own current value keeps one selectable in a picker.

## July 2026 (installments, currency, onboarding)

### Installments

- **Installment plans**: log a purchase once as a bounded N-payment schedule (e.g. a phone financed over 24 months) instead of re-entering it every month. Create a plan inline from the transaction form, or manage existing plans from the Transactions tab.
- **Manage plans**: progress, edit, complete and delete for every plan, from a button on the Installments card in the Transactions tab.

### Currency and budget months

- **Settings → Money & months**: currency, number-format locale (comma vs dot decimals), and the day of the month the budget period rolls over are now per-tenant configuration instead of hardcoded EUR/`de-DE`/day-13 assumptions.
- The **setup wizard** collects these during first-run and can be re-opened any time from Settings to revisit them (also fixes categories/accounts started outside the wizard).

### Cash reconciliation

- **Reconciled badge** (✓) on a month's row once cash is entered and every card statement for that month is paid.

## July 2026 (reconciliation UX)

### Cash reconciliation

- **Gap split** on desktop and mobile: **Carryover**, **This month**, and **Total gap** columns replace a single opaque gap.
- Analytics copy explains how carryover vs this-month drift maps to reconciliation.

### Transactions

- **Statement payment rows** appear in the list when a deferred card statement is marked paid (derived from statement status + cash recon, not stored as transactions).
- **Header refresh** on every tab; pull-to-refresh on mobile. Toast on success or failure.

### Offline / PWA

- **IndexedDB snapshot** of the last successful load for read-only viewing when offline or when refresh fails.
- **Offline banner** distinguishes true offline vs online with stale cache; editing disabled until reconnect or refresh.

## July 2026

### Transactions

- **Date scope dropdown** replaces the old “filter by calendar date range” checkbox: budget month (default), last 3 months, all dates, or custom range anchored to the viewed month.
- **Per-day +** on date headers opens the add form with that calendar date pre-filled (FAB still adds for today).
- **Duplicate** — swipe left on a row (mobile) for **Copy**, or use **Duplicate** in the edit modal (desktop). Opens a new transaction with copied fields and a “Copied from …” hint. Swipe eases open/closed on release; tap an open row to close it.
- **Delete** (mobile swipe or batch select) uses an in-app confirm sheet with context.
- **Upcoming** recurring suggestions anchor monthly items to the viewed budget month (fixes missed suggestions when the prior charge landed in an earlier BM).
- **Upcoming** groups recurring patterns by category so subscription “Glovo” is not mixed with food orders sharing the same description.

### Dashboard

- **Recent activity** toggle: **Latest** (by transaction date) vs **Recently added** (by entry time).

### Analytics (mobile)

- YTD budget vs actual block and invested KPIs on the Summary segment.

### PWA / access

- Service worker no longer intercepts `/api` (fixes iOS auth failures).
- Access error screen shows copyable diagnostics; optional reload banner when a new build is available.

## June 2026 (Goals milestone)

- Goals tab: multi-scenario projections, FIRE/housing/rent-vs-buy charts, scenario show/hide, glossary.
